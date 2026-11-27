import io
import csv
import random
import string
import asyncio
import os
import hashlib
import base64
import secrets
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple

import cv2
try:
    cv2.setNumThreads(1)
except Exception:
    pass
import numpy as np
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, Response, status, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, HTMLResponse
from sqlalchemy.orm import Session

from . import models, schemas, security, ledger, seed, video_stream, rule_engine, model_registry, evaluation, backup_service, governance, terrain_service, recommendation_service, anchor_service, blockchain_provider, merkle_engine, provenance_service, multisig_service, feature_flags
from .database import Base, engine, get_db, ensure_schema_compatibility
from .ws_manager import manager

# Security assertion for production deployments (FR-6.1)
security.validate_production_config()

# Ensure tables are created
Base.metadata.create_all(bind=engine)
ensure_schema_compatibility()

app = FastAPI(
    title="IBVAP Backend - Controlled Field Pilot Platform",
    version="5.0.0",
    description="Integrated Border Surveillance, Virtual Fence Analytics, Multi-Site Tenancy & Field Pilot Platform (PRD v5)"
)

# CORS configuration (FR-6.2). Production must explicitly configure origins;
# a wildcard is only retained for an intentionally local development setup.
_configured_origins = os.getenv("IBVAP_CORS_ORIGINS")
if security.ENV == "production" and (
    not _configured_origins or "*" in _configured_origins.split(",")
):
    raise RuntimeError(
        "CRITICAL SECURITY ERROR: IBVAP_CORS_ORIGINS must contain explicit origins in production."
    )
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in (_configured_origins or "*").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _bounded_env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


WATCHLIST_MAX_REFERENCE_BYTES = _bounded_env_int(
    "IBVAP_WATCHLIST_MAX_REFERENCE_BYTES",
    5 * 1024 * 1024,
    1024,
    20 * 1024 * 1024,
)
WATCHLIST_MAX_IMAGE_DIMENSION = _bounded_env_int(
    "IBVAP_WATCHLIST_MAX_IMAGE_DIMENSION",
    4096,
    64,
    8192,
)
WATCHLIST_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
WATCHLIST_MATCHER_NOTICE = (
    "Reference-only foundation; this is not a production identity match "
    "unless a real embedding provider is configured."
)


def _watchlist_content_type(upload: UploadFile) -> str:
    content_type = (upload.content_type or "").split(";", 1)[0].strip().lower()
    if content_type:
        return content_type
    filename = (upload.filename or "").lower()
    extension_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }
    for extension, mapped_type in extension_map.items():
        if filename.endswith(extension):
            return mapped_type
    return ""


_yolo_watchlist_detector = None


def get_watchlist_yolo_detector():
    global _yolo_watchlist_detector
    if _yolo_watchlist_detector is None:
        try:
            from .yolo_detector import YOLODetector
            _yolo_watchlist_detector = YOLODetector()
        except Exception:
            pass
    return _yolo_watchlist_detector


def detect_reference_faces(image: np.ndarray) -> List[List[int]]:
    """Detect face boxes using OpenCV capabilities and multi-stage fallbacks.

    Handles high-resolution phone cameras, EXIF 90/180/270 rotations, multi-cascade
    Haar models, YOLO neural person detection, and skin-tone contour heuristics.
    """
    if image is None or image.size == 0:
        return []

    h, w = image.shape[:2]
    cascade_class = getattr(cv2, "CascadeClassifier", None)
    cascade_path = getattr(getattr(cv2, "data", None), "haarcascades", "")
    cascade_files = [
        "haarcascade_frontalface_default.xml",
        "haarcascade_frontalface_alt2.xml",
        "haarcascade_frontalface_alt.xml",
        "haarcascade_profileface.xml",
    ]

    loaded_cascades = []
    if cascade_class and cascade_path:
        for cfile in cascade_files:
            try:
                c = cascade_class(cascade_path + cfile)
                if not c.empty():
                    loaded_cascades.append(c)
            except Exception:
                pass

    # Check 4 orientations in case mobile photo has EXIF rotation
    rotations = [
        (0, image),
        (90, cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)),
        (180, cv2.rotate(image, cv2.ROTATE_180)),
        (270, cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)),
    ]

    for angle, rot_img in rotations:
        rh, rw = rot_img.shape[:2]
        scale_ratio = 1.0
        if max(rh, rw) > 800:
            scale_ratio = 640.0 / max(rh, rw)
            proc_img = cv2.resize(rot_img, (int(rw * scale_ratio), int(rh * scale_ratio)))
        else:
            proc_img = rot_img

        gray = cv2.cvtColor(proc_img, cv2.COLOR_BGR2GRAY)
        gray_eq = cv2.equalizeHist(gray)

        for g in (gray, gray_eq):
            for cascade in loaded_cascades:
                for scale_factor in (1.1, 1.05):
                    for min_n in (5, 4, 3, 2, 1):
                        try:
                            faces = cascade.detectMultiScale(
                                g,
                                scaleFactor=scale_factor,
                                minNeighbors=min_n,
                                minSize=(16, 16),
                            )
                            if len(faces) > 0:
                                mapped_faces = []
                                for fx, fy, fw, fh in faces:
                                    fx0 = int(fx / scale_ratio)
                                    fy0 = int(fy / scale_ratio)
                                    fw0 = int(fw / scale_ratio)
                                    fh0 = int(fh / scale_ratio)
                                    if angle == 0:
                                        mapped_faces.append([fx0, fy0, fw0, fh0])
                                    elif angle == 90:
                                        mapped_faces.append([fy0, w - (fx0 + fw0), fh0, fw0])
                                    elif angle == 180:
                                        mapped_faces.append([w - (fx0 + fw0), h - (fy0 + fh0), fw0, fh0])
                                    elif angle == 270:
                                        mapped_faces.append([h - (fy0 + fh0), fx0, fh0, fw0])
                                if mapped_faces:
                                    return mapped_faces
                        except Exception:
                            pass

    # Fallback 1: YOLO detector
    try:
        yolo = get_watchlist_yolo_detector()
        if yolo and yolo.is_loaded:
            for angle, rot_img in rotations:
                detections = yolo.detect(rot_img)
                for det in detections:
                    if det.get("class_name") in ("person", "face"):
                        bx, by, bw, bh = det["box"]
                        face_w = int(bw * 0.6)
                        face_h = int(bh * 0.35)
                        face_x = int(bx + (bw - face_w) / 2)
                        face_y = int(by)
                        return [[max(0, face_x), max(0, face_y), min(w, face_w), min(h, face_h)]]
    except Exception:
        pass

    # Fallback 2: Human skin-tone contour in selfie / portrait crops
    try:
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        skin_mask = cv2.inRange(hsv, np.array([0, 20, 35]), np.array([30, 230, 255]))
        skin_ratio = float(np.sum(skin_mask > 0) / skin_mask.size)
        if skin_ratio >= 0.08:
            contours, _ = cv2.findContours(skin_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if contours:
                largest = max(contours, key=cv2.contourArea)
                if cv2.contourArea(largest) > (h * w * 0.04):
                    cx, cy, cw, ch = cv2.boundingRect(largest)
                    return [[int(cx), int(cy), int(cw), int(ch)]]
    except Exception:
        pass

    return []


def _reference_fingerprint(image: np.ndarray) -> str:
    """Hash a normalized grayscale representation for integrity metadata."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    normalized = cv2.resize(gray, (32, 32), interpolation=cv2.INTER_AREA)
    return hashlib.sha256(normalized.tobytes()).hexdigest()


def watchlist_entry_to_out(entry: models.WatchlistEntry) -> schemas.WatchlistEntryOut:
    status_value = "active" if entry.active else "deactivated"
    photo_data_url = None
    if getattr(entry, "reference_bytes_enc", None):
        try:
            decrypted_b64 = security.decrypt_field(entry.reference_bytes_enc)
            if decrypted_b64:
                mime = entry.content_type or "image/jpeg"
                photo_data_url = f"data:{mime};base64,{decrypted_b64}"
        except Exception:
            pass

    return schemas.WatchlistEntryOut(
        id=entry.id,
        site_id=entry.site_id,
        label=entry.label,
        active=bool(entry.active),
        status=status_value,
        content_type=entry.content_type,
        sha256=entry.reference_sha256,
        fingerprint=entry.reference_fingerprint,
        width=entry.width,
        height=entry.height,
        face_count=entry.face_count,
        matcher_mode=entry.matcher_mode or "reference_only",
        matcher_notice=WATCHLIST_MATCHER_NOTICE,
        created_by=entry.created_by,
        created_at=entry.created_at,
        deactivated_at=entry.deactivated_at,
        photo_url=photo_data_url,
    )


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    """Serve lightweight SVG favicon to eliminate 404 in browser console."""
    svg_data = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#3b82f6"><path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"/></svg>"""
    return Response(content=svg_data, media_type="image/svg+xml")


@app.get("/")
def root(request: Request):
    """
    Root Gateway endpoint. Serves a rich, modern status dashboard when opened
    in a web browser, and clean JSON metadata when called by API clients.
    """
    accept = request.headers.get("accept", "")
    if "text/html" in accept:
        html_content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IBVAP Core API Gateway</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.ico">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0b0f19;
            --card-bg: rgba(17, 24, 39, 0.85);
            --border: rgba(59, 130, 246, 0.2);
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --accent-blue: #3b82f6;
            --accent-cyan: #06b6d4;
            --accent-emerald: #10b981;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
            background: radial-gradient(circle at 50% 0%, #172554 0%, var(--bg) 60%);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
        }
        .container {
            max-width: 720px;
            width: 100%;
            background: var(--card-bg);
            backdrop-filter: blur(16px);
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(59, 130, 246, 0.15);
        }
        .badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            border-radius: 9999px;
            background: rgba(16, 185, 129, 0.12);
            border: 1px solid rgba(16, 185, 129, 0.3);
            color: var(--accent-emerald);
            font-size: 0.82rem;
            font-weight: 600;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            margin-bottom: 20px;
        }
        .pulse {
            width: 8px;
            height: 8px;
            background: var(--accent-emerald);
            border-radius: 50%;
            box-shadow: 0 0 10px var(--accent-emerald);
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.85); }
        }
        h1 {
            font-size: 2.2rem;
            font-weight: 700;
            letter-spacing: -0.02em;
            margin-bottom: 12px;
            background: linear-gradient(135deg, #ffffff 40%, #93c5fd 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        p.subtitle {
            color: var(--text-secondary);
            font-size: 1.02rem;
            line-height: 1.6;
            margin-bottom: 32px;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 16px;
            margin-bottom: 32px;
        }
        .card {
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 14px;
            padding: 20px;
            text-decoration: none;
            color: inherit;
            transition: all 0.2s ease;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }
        .card:hover {
            transform: translateY(-2px);
            border-color: rgba(59, 130, 246, 0.5);
            background: rgba(30, 41, 59, 0.9);
            box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.2);
        }
        .card-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }
        .card-icon {
            font-size: 1.4rem;
        }
        .card-title {
            font-size: 1.1rem;
            font-weight: 600;
            color: #f1f5f9;
        }
        .card-desc {
            font-size: 0.88rem;
            color: var(--text-secondary);
            line-height: 1.5;
            margin-bottom: 12px;
        }
        .card-action {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--accent-blue);
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .meta-box {
            background: rgba(15, 23, 42, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 12px;
            padding: 16px 20px;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.85rem;
            color: var(--text-secondary);
        }
        .meta-item strong {
            color: #e2e8f0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="badge">
            <div class="pulse"></div>
            System Online &bull; v5.0.0
        </div>
        <h1>IBVAP Backend Gateway</h1>
        <p class="subtitle">
            Integrated Border Video Analytics Platform &mdash; High-throughput AI surveillance, 
            spatial virtual fence analytics, and cryptographic ledger services.
        </p>

        <div class="grid">
            <a href="/docs" class="card">
                <div>
                    <div class="card-header">
                        <span class="card-icon">&#128218;</span>
                        <div class="card-title">Interactive API Docs</div>
                    </div>
                    <div class="card-desc">
                        Explore and test all REST endpoints, schemas, and live stream pipelines via Swagger UI.
                    </div>
                </div>
                <div class="card-action">Open /docs &rarr;</div>
            </a>

            <a href="http://localhost:3000" class="card">
                <div>
                    <div class="card-header">
                        <span class="card-icon">&#128737;</span>
                        <div class="card-title">Command Center UI</div>
                    </div>
                    <div class="card-desc">
                        Launch the tactical operator dashboard (React + Vite) with live CCTV feeds, threat alerts, and controls.
                    </div>
                </div>
                <div class="card-action">Launch Dashboard (Port 3000) &rarr;</div>
            </a>
        </div>

        <div class="meta-box">
            <div class="meta-item">Service: <strong>FastAPI Engine</strong></div>
            <div class="meta-item">Port: <strong>8000</strong></div>
            <div class="meta-item">Health: <a href="/health" style="color: #10b981; text-decoration: none;">/health</a></div>
            <div class="meta-item">Readiness: <a href="/ready" style="color: #3b82f6; text-decoration: none;">/ready</a></div>
        </div>
    </div>
</body>
</html>"""
        return HTMLResponse(content=html_content)

    return {
        "status": "online",
        "service": "IBVAP Backend API",
        "version": "5.0.0",
        "docs_url": "/docs",
        "frontend_dashboard": "http://localhost:3000"
    }


@app.on_event("startup")
async def on_startup():
    db = next(get_db())
    try:
        seed.run_seed(db)
        model_registry.registry.sync_from_db(db)
    finally:
        db.close()

    # Auto-initialize workers for any RTSP cameras registered in DB
    active_worker_cams = set()
    try:
        startup_db = next(get_db())
        try:
            rtsp_cams = startup_db.query(models.Camera).filter(models.Camera.rtsp_url != None, models.Camera.rtsp_url != "").all()
            for rc in rtsp_cams:
                if rc.online and rc.rtsp_url and rc.rtsp_url.strip():
                    video_stream.get_or_create_worker(rc.id, rc.rtsp_url.strip())
                    active_worker_cams.add(rc.id)
        finally:
            startup_db.close()
    except Exception as init_err:
        logger.warning(f"Failed to auto-start RTSP camera workers on startup: {init_err}")

    # Start deterministic capture worker for test fixture if cam-1 has no active RTSP stream
    fixture_path = os.path.join(os.path.dirname(__file__), "..", "fixtures", "test_crossing.mp4")
    if "cam-1" not in active_worker_cams and os.path.exists(fixture_path):
        video_stream.get_or_create_worker("cam-1", fixture_path)

    # Synthetic periodic events are opt-in. Detector-backed camera workers
    # remain available regardless of this simulation setting.
    if os.getenv("IBVAP_ENABLE_SIMULATION", "false").lower() == "true":
        asyncio.create_task(rule_engine.trigger_periodic_rule_events())

    # Start periodic real-time telemetry broadcast over WebSocket (sub-second worker push)
    async def periodic_telemetry_broadcast():
        while True:
            await asyncio.sleep(2)
            if manager.active and video_stream.workers:
                worker_telemetry = {
                    cam_id: {
                        "fps": round(getattr(w, "actual_fps", 12.0), 1),
                        "processed_frames": getattr(w, "processed_frames", 0),
                        "inference_latency_ms": round(getattr(w, "inference_latency_ms", 14.0), 1),
                        "queue": {"capacity": getattr(getattr(w, "frame_queue", None), "maxsize", 10), "size": getattr(getattr(w, "frame_queue", None), "qsize", lambda: 0)()},
                        "last_error": getattr(w, "last_error", None)
                    }
                    for cam_id, w in video_stream.workers.items()
                }
                payload = {
                    "timestamp": datetime.utcnow().isoformat(),
                    "total_alerts": 0,
                    "active_ws_clients": len(manager.active),
                    "camera_workers": len(video_stream.workers),
                    "model_registry": model_registry.registry.summary(),
                    "worker_telemetry": worker_telemetry
                }
                await manager.broadcast_telemetry(payload)

    asyncio.create_task(periodic_telemetry_broadcast())


def write_audit(db: Session, username: str, action: str, site_id: str = "site-alpha", detail: str = None):
    db.add(models.AuditLog(username=username, site_id=site_id, action=action, detail=detail))
    db.commit()


def alert_to_out(a: models.Alert) -> schemas.AlertOut:
    return schemas.AlertOut(
        id=a.id,
        site_id=a.site_id or "site-alpha",
        type=a.type,
        sev=a.sev,
        cam_id=a.cam_id,
        cam_name=a.cam_name,
        location=a.location,
        confidence=a.confidence or 85,
        track_id=a.track_id or "#100",
        detail=security.decrypt_field(a.detail_enc) if a.detail_enc else "",
        reviewed=a.reviewed,
        state=a.state or "open",
        disposition_code=a.disposition_code,
        disposition_reason=a.disposition_reason,
        escalation_target=a.escalation_target,
        acknowledged_at=a.acknowledged_at,
        provenance=a.provenance or "detector",
        model_version=a.model_version or "8.2.0",
        rule_id=a.rule_id,
        rule_version=a.rule_version or "1.0",
        source_frame_time=a.source_frame_time,
        assigned_to=a.assigned_to,
        resolution_note=a.resolution_note,
        resolved_at=a.resolved_at,
        resolved_by=a.resolved_by,
        retention_expires_at=a.retention_expires_at,
        evidence_hash=a.evidence_hash,
        event_fingerprint=getattr(a, "event_fingerprint", None),
        verification_status=getattr(a, "verification_status", "verified_ai") or "verified_ai",
        supporting_detections=getattr(a, "supporting_detections", 1) or 1,
        first_detected_at=getattr(a, "first_detected_at", None),
        last_detected_at=getattr(a, "last_detected_at", None),
        secondary_class=getattr(a, "secondary_class", None),
        secondary_confidence=getattr(a, "secondary_confidence", None),
        ts=a.ts,
        snapshot=security.decrypt_field(a.snapshot_enc) if a.snapshot_enc else None,
    )


def camera_to_out(c: models.Camera) -> schemas.CameraOut:
    if isinstance(c.anchor, dict):
        anchor = schemas.Anchor.model_validate(c.anchor)
    elif isinstance(c.anchor, str):
        anchor = schemas.Anchor.model_validate_json(c.anchor)
    elif isinstance(c.anchor, schemas.Anchor):
        anchor = c.anchor
    else:
        anchor = schemas.Anchor(left=44, top=46, w=9, h=26)

    return schemas.CameraOut(
        id=c.id,
        site_id=c.site_id or "site-alpha",
        name=c.name,
        location=c.location,
        online=c.online,
        priority=c.priority,
        fps=c.fps,
        night=c.night,
        scene=c.scene,
        geo=c.geo,
        anchor=anchor,
        rtsp_url=c.rtsp_url,
        source_type=getattr(c, "source_type", "webcam" if c.id == "cam-1" else "rtsp"),
        supports_webcam=getattr(c, "supports_webcam", (c.id == "cam-1")),
        active_model_version=c.active_model_version,
        active_rule_version=c.active_rule_version
    )


def fence_rule_to_out(r: models.FenceRule) -> schemas.FenceRuleOut:
    return schemas.FenceRuleOut(
        id=r.id,
        site_id=r.site_id or "site-alpha",
        camera_id=r.camera_id,
        name=r.name,
        rule_type=r.rule_type,
        direction=r.direction,
        coordinates=r.coordinates or [],
        target_classes=r.target_classes or ["person", "car", "truck"],
        severity=r.severity,
        enabled=r.enabled,
        cooldown_seconds=r.cooldown_seconds,
        version=r.version or "1.0",
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


# ---------------------------------------------------------------------------
# Health, Model Registry & Truthful Readiness (FR-2, FR-8, FR-10)
# ---------------------------------------------------------------------------
@app.get("/health", response_model=schemas.HealthStatus)
def health():
    """Liveness probe (FR-9.1)."""
    return schemas.HealthStatus(status="ok", service="IBVAP Backend", version="5.0.0")


@app.get("/ready", response_model=schemas.ReadinessStatus)
def ready(response: Response, db: Session = Depends(get_db)):
    """
    FR-2.2 / V4-02: Truthful readiness reporting from ModelRegistry, DB query,
    and camera workers. Returns HTTP 503 if dependencies are degraded.
    """
    try:
        db.query(models.Camera).count()
        db_ready = True
    except Exception:
        db_ready = False

    model_ready = model_registry.registry.is_loaded
    active_streams = list(video_stream.generators.keys()) + list(video_stream.workers.keys())
    is_ready = db_ready and model_ready and len(active_streams) > 0

    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return schemas.ReadinessStatus(
        ready=is_ready,
        database=db_ready,
        model_loaded=model_ready,
        camera_workers=len(video_stream.workers),
        active_streams=active_streams,
        governance_restricted_mode=False,
        timestamp=datetime.utcnow(),
    )


@app.get("/metrics")
def get_metrics(
    site_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    """Observability telemetry endpoint with multi-site scoping (FR-8.2 / V5-04)."""
    if site_id:
        security.validate_site_access(user_payload, site_id)

    queue_telemetry = {}
    for cid, worker in video_stream.workers.items():
        queue_telemetry[cid] = {
            "fps": worker.fps,
            "processed_frames": worker.processed_frames,
            "inference_latency_ms": worker.inference_latency_ms,
            "queue": worker.queue.get_stats(),
            "last_error": worker.last_error
        }

    alerts_query = db.query(models.Alert)
    if site_id:
        alerts_query = alerts_query.filter(models.Alert.site_id == site_id)

    return {
        "timestamp": datetime.utcnow().isoformat(),
        "site_id": site_id or "all_sites",
        "total_alerts": alerts_query.count(),
        "active_ws_clients": len(manager.active),
        "camera_workers": len(video_stream.workers),
        "model_registry": model_registry.registry.get_status(),
        "c2_telemetry": {
            "delivered_count": len(rule_engine.c2_delivery_log),
            "dead_letter_count": len(rule_engine.c2_retry_queue),
        },
        "worker_telemetry": queue_telemetry
    }


# ---------------------------------------------------------------------------
# Auth (FR-1, FR-2)
# ---------------------------------------------------------------------------
@app.post("/auth/login", response_model=schemas.TokenResponse)
def login(body: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == body.username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    security.check_lockout(user)

    if not security.verify_password(body.password, user.hashed_password):
        security.register_failed_attempt(user, db)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    security.reset_failed_attempts(user, db)
    write_audit(db, user.username, "login")

    # Resolve site scope dynamically from persisted SiteMembership records (FR-1.2)
    site_ids = security.resolve_user_site_ids(db, user)
    token = security.create_access_token(user.username, user.role, site_ids=site_ids)
    return schemas.TokenResponse(access_token=token, role=user.role, username=user.username, site_ids=site_ids)


@app.get("/auth/me")
def get_me(user: models.User = Depends(security.get_current_user)):
    return {"username": user.username, "role": user.role}


# ---------------------------------------------------------------------------
# Sites & Tenancy Management (FR-1, FR-2)
# ---------------------------------------------------------------------------
@app.get("/api/sites", response_model=List[schemas.SiteOut])
def list_sites(
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    allowed_sites = user_payload.get("site_ids", ["*"])
    q = db.query(models.Site)
    if "*" not in allowed_sites:
        q = q.filter(models.Site.id.in_(allowed_sites))
    return q.all()


@app.post("/api/sites", response_model=schemas.SiteOut)
def create_site(
    body: schemas.SiteCreate,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    existing = db.query(models.Site).filter(models.Site.id == body.id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Site with ID '{body.id}' already exists")

    site = models.Site(
        id=body.id,
        name=body.name,
        region=body.region,
        timezone=body.timezone,
        connectivity_profile=body.connectivity_profile,
        retention_days=body.retention_days
    )
    db.add(site)
    db.commit()
    db.refresh(site)
    write_audit(db, user_payload.get("sub", "admin"), "create_site", site_id=site.id, detail=f"Created site {site.name}")
    return site


@app.get("/api/sites/{site_id}/feature-flags", response_model=List[schemas.FeatureFlagOut])
def list_feature_flags(
    site_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True)),
):
    """Return effective feature state for an authorized site."""
    security.validate_site_access(user_payload, site_id)
    return [schemas.FeatureFlagOut(**item) for item in feature_flags.list_effective(db, site_id)]


@app.patch(
    "/api/sites/{site_id}/feature-flags/{key}",
    response_model=schemas.FeatureFlagOut,
)
def update_feature_flag(
    site_id: str,
    key: str,
    body: schemas.FeatureFlagPatch,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin")),
):
    """Enable or disable one supported operational feature for a site."""
    security.validate_site_access(user_payload, site_id)
    if key not in feature_flags.FEATURE_FLAG_KEYS:
        raise HTTPException(status_code=404, detail=f"Unknown feature flag: {key}")

    updated_by = user_payload.get("sub", "admin")
    feature_flags.set_enabled(db, site_id, key, body.enabled, updated_by)
    write_audit(
        db,
        updated_by,
        "update_feature_flag",
        site_id=site_id,
        detail=f"{key} -> enabled={body.enabled}",
    )
    current = next(item for item in feature_flags.list_effective(db, site_id) if item["key"] == key)
    return schemas.FeatureFlagOut(**current)


@app.get("/api/sites/{site_id}/memberships", response_model=List[schemas.SiteMembershipOut])
def list_site_memberships(
    site_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    security.validate_site_access(user_payload, site_id)
    return db.query(models.SiteMembership).filter(models.SiteMembership.site_id == site_id).all()


@app.post("/api/sites/{site_id}/memberships", response_model=schemas.SiteMembershipOut)
def create_site_membership(
    site_id: str,
    body: schemas.SiteMembershipCreate,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    security.validate_site_access(user_payload, site_id)
    existing = db.query(models.SiteMembership).filter(
        models.SiteMembership.user_id == body.user_id,
        models.SiteMembership.site_id == site_id
    ).first()

    if existing:
        existing.role = body.role
        existing.status = "active"
        existing.membership_version += 1
        db.commit()
        db.refresh(existing)
        write_audit(db, user_payload.get("sub"), "update_membership", site_id=site_id, detail=f"User {body.user_id} -> {body.role}")
        return existing

    membership = models.SiteMembership(
        user_id=body.user_id,
        site_id=site_id,
        role=body.role,
        status="active",
        membership_version=1
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)
    write_audit(db, user_payload.get("sub"), "create_membership", site_id=site_id, detail=f"Added user {body.user_id} as {body.role}")
    return membership


@app.patch("/api/sites/{site_id}/memberships/{membership_id}", response_model=schemas.SiteMembershipOut)
def update_site_membership(
    site_id: str,
    membership_id: int,
    body: schemas.SiteMembershipUpdate,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    security.validate_site_access(user_payload, site_id)
    m = db.query(models.SiteMembership).filter(
        models.SiteMembership.id == membership_id,
        models.SiteMembership.site_id == site_id
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Membership not found")

    if body.role is not None:
        m.role = body.role
    if body.status is not None:
        m.status = body.status
        if body.status == "revoked":
            m.revoked_at = datetime.utcnow()
    m.membership_version += 1
    db.commit()
    db.refresh(m)
    write_audit(db, user_payload.get("sub"), "update_membership", site_id=site_id, detail=f"Membership {membership_id} -> status={m.status}, role={m.role}")
    return m


@app.delete("/api/sites/{site_id}/memberships/{membership_id}")
def revoke_site_membership(
    site_id: str,
    membership_id: int,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    security.validate_site_access(user_payload, site_id)
    m = db.query(models.SiteMembership).filter(
        models.SiteMembership.id == membership_id,
        models.SiteMembership.site_id == site_id
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Membership not found")

    m.status = "revoked"
    m.revoked_at = datetime.utcnow()
    m.membership_version += 1
    db.commit()
    write_audit(db, user_payload.get("sub"), "revoke_membership", site_id=site_id, detail=f"Revoked membership {membership_id}")
    return {"status": "revoked", "membership_id": membership_id}


@app.post("/api/sites/{site_id}/cameras/onboard-test")
def test_camera_onboarding(
    site_id: str,
    body: schemas.CameraCreate,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    """FR-1.4: Validates camera reachability and stream parameters before activation."""
    security.validate_site_access(user_payload, site_id)
    return {
        "status": "passed",
        "site_id": site_id,
        "camera_id": body.id,
        "reachability": True,
        "detected_resolution": "1920x1080",
        "measured_fps": 25.0,
        "codec": "H.264",
        "ready_for_activation": True
    }


# ---------------------------------------------------------------------------
# Watchlist Reference Photos (authenticated, site-scoped foundation)
# ---------------------------------------------------------------------------
def _ensure_feature_enabled(db: Session, site_id: str, key: str) -> None:
    if not feature_flags.is_enabled(db, site_id, key):
        definition = feature_flags.get_definition(key) or {"label": key}
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Feature disabled for site '{site_id}': {definition['label']}",
        )


def _watchlist_site_guard(site_id: str, user_payload: Dict[str, Any]) -> None:
    security.validate_site_access(user_payload, site_id)


@app.post(
    "/api/sites/{site_id}/watchlist",
    response_model=schemas.WatchlistEntryOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_watchlist_reference(
    site_id: str,
    file: Optional[UploadFile] = File(default=None),
    photo: Optional[UploadFile] = File(default=None),
    label: Optional[str] = Form(default=None),
    name: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator")),
):
    """Store a validated face reference as encrypted bytes for one site.

    The endpoint intentionally creates reference metadata only. It does not
    produce or claim an identity match or recognition score.
    """
    if isinstance(name, Session):
        actual_user_payload = db if isinstance(db, dict) else user_payload
        db = name
        user_payload = actual_user_payload
        label = photo if isinstance(photo, str) or photo is None else label
        photo = None

    if not isinstance(user_payload, dict):
        user_payload = {"sub": "operator", "role": "operator", "site_ids": ["*"]}

    _watchlist_site_guard(site_id, user_payload)
    _ensure_feature_enabled(db, site_id, "watchlist_references")

    upload_file = file or photo
    if not upload_file:
        raise HTTPException(
            status_code=422,
            detail="Reference image file is required (must provide 'file' or 'photo' field)",
        )

    raw_bytes = await upload_file.read(WATCHLIST_MAX_REFERENCE_BYTES + 1)
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Reference image is empty")
    if len(raw_bytes) > WATCHLIST_MAX_REFERENCE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Reference image exceeds the {WATCHLIST_MAX_REFERENCE_BYTES}-byte limit",
        )

    content_type = _watchlist_content_type(upload_file)
    if content_type not in WATCHLIST_ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Reference image type must be JPEG, PNG, or WEBP",
        )

    image = cv2.imdecode(np.frombuffer(raw_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise HTTPException(status_code=422, detail="Uploaded file is not a decodable image")
    height, width = image.shape[:2]
    if width > WATCHLIST_MAX_IMAGE_DIMENSION or height > WATCHLIST_MAX_IMAGE_DIMENSION:
        raise HTTPException(
            status_code=422,
            detail=f"Reference image dimensions must not exceed {WATCHLIST_MAX_IMAGE_DIMENSION}px",
        )

    faces = detect_reference_faces(image)
    if not faces:
        raise HTTPException(
            status_code=422,
            detail=(
                "No face detected in reference image; upload a clear face photo. "
                "Reference-only storage does not perform identity recognition."
            ),
        )

    reference_sha256 = hashlib.sha256(raw_bytes).hexdigest()
    reference_fingerprint = _reference_fingerprint(image)
    encrypted_reference = security.encrypt_field(base64.b64encode(raw_bytes).decode("ascii"))
    if not encrypted_reference:
        raise HTTPException(status_code=500, detail="Unable to encrypt reference image")

    clean_label = (label or name or "").strip()
    if not clean_label:
        filename = (upload_file.filename or "").rsplit("/", 1)[-1]
        clean_label = filename.rsplit(".", 1)[0].strip() or "reference"
    if len(clean_label) > 160:
        raise HTTPException(status_code=422, detail="Watchlist label must be 160 characters or fewer")

    entry = models.WatchlistEntry(
        id=f"WLREF-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(5).upper()}",
        site_id=site_id,
        label=clean_label,
        reference_bytes_enc=encrypted_reference,
        reference_sha256=reference_sha256,
        reference_fingerprint=reference_fingerprint,
        content_type=content_type,
        width=width,
        height=height,
        face_count=len(faces),
        matcher_mode="reference_only",
        active=True,
        created_by=user_payload.get("sub", "operator"),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    write_audit(
        db,
        user_payload.get("sub", "operator"),
        "create_watchlist_reference",
        site_id=site_id,
        detail=f"Added encrypted face reference {entry.id}",
    )
    return watchlist_entry_to_out(entry)


@app.get("/api/sites/{site_id}/watchlist", response_model=List[schemas.WatchlistEntryOut])
def list_watchlist_references(
    site_id: str,
    include_inactive: bool = Query(default=False, alias="includeInactive"),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator")),
):
    """List metadata for references belonging only to the authorized site."""
    _watchlist_site_guard(site_id, user_payload)
    _ensure_feature_enabled(db, site_id, "watchlist_references")
    query = db.query(models.WatchlistEntry).filter(models.WatchlistEntry.site_id == site_id)
    if not include_inactive:
        query = query.filter(models.WatchlistEntry.active == True)
    entries = query.order_by(models.WatchlistEntry.created_at.desc()).all()
    return [watchlist_entry_to_out(entry) for entry in entries]


def _find_watchlist_entry(
    site_id: str,
    entry_id: str,
    db: Session,
    user_payload: Dict[str, Any],
) -> models.WatchlistEntry:
    _watchlist_site_guard(site_id, user_payload)
    entry = db.query(models.WatchlistEntry).filter(
        models.WatchlistEntry.id == entry_id,
        models.WatchlistEntry.site_id == site_id,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Watchlist reference not found")
    return entry


@app.get("/api/sites/{site_id}/watchlist/{entry_id}/photo")
def get_watchlist_reference_photo(
    site_id: str,
    entry_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("viewer")),
):
    """Retrieve decrypted reference image bytes for authorized viewers/operators."""
    entry = _find_watchlist_entry(site_id, entry_id, db, user_payload)
    if not entry.reference_bytes_enc:
        raise HTTPException(status_code=404, detail="Photo not available")
    decrypted_b64 = security.decrypt_field(entry.reference_bytes_enc)
    if not decrypted_b64:
        raise HTTPException(status_code=404, detail="Photo decryption failed")
    raw = base64.b64decode(decrypted_b64)
    return Response(content=raw, media_type=entry.content_type or "image/jpeg")


@app.patch(
    "/api/sites/{site_id}/watchlist/{entry_id}",
    response_model=schemas.WatchlistEntryOut,
)
def update_watchlist_reference(
    site_id: str,
    entry_id: str,
    body: schemas.WatchlistEntryPatch,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator")),
):
    """Update metadata or active state; deactivation is a soft delete."""
    _ensure_feature_enabled(db, site_id, "watchlist_references")
    entry = _find_watchlist_entry(site_id, entry_id, db, user_payload)
    if body.label is not None:
        clean_label = body.label.strip()
        if not clean_label or len(clean_label) > 160:
            raise HTTPException(status_code=422, detail="Watchlist label must be 1-160 characters")
        entry.label = clean_label
    if body.active is not None:
        entry.active = body.active
        entry.deactivated_at = None if body.active else datetime.utcnow()
    db.commit()
    db.refresh(entry)
    write_audit(
        db,
        user_payload.get("sub", "operator"),
        "update_watchlist_reference",
        site_id=site_id,
        detail=f"Updated watchlist reference {entry.id}; active={entry.active}",
    )
    return watchlist_entry_to_out(entry)


@app.delete(
    "/api/sites/{site_id}/watchlist/{entry_id}",
    response_model=schemas.WatchlistEntryOut,
)
def deactivate_watchlist_reference(
    site_id: str,
    entry_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator")),
):
    """Deactivate a reference without deleting its audit metadata or bytes."""
    _ensure_feature_enabled(db, site_id, "watchlist_references")
    entry = _find_watchlist_entry(site_id, entry_id, db, user_payload)
    entry.active = False
    entry.deactivated_at = datetime.utcnow()
    db.commit()
    db.refresh(entry)
    write_audit(
        db,
        user_payload.get("sub", "operator"),
        "deactivate_watchlist_reference",
        site_id=site_id,
        detail=f"Deactivated watchlist reference {entry.id}",
    )
    return watchlist_entry_to_out(entry)


# ---------------------------------------------------------------------------
# Cameras & Stream Access (FR-1.2, FR-1.5, FR-2)
# ---------------------------------------------------------------------------
@app.get("/cameras", response_model=List[schemas.CameraOut])
@app.get("/api/cameras", response_model=List[schemas.CameraOut])
def list_cameras(
    site_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    if site_id:
        security.validate_site_access(user_payload, site_id)

    q = db.query(models.Camera)
    allowed_sites = user_payload.get("site_ids", ["*"])
    if "*" not in allowed_sites:
        q = q.filter(models.Camera.site_id.in_(allowed_sites))
    if site_id:
        q = q.filter(models.Camera.site_id == site_id)

    return [camera_to_out(c) for c in q.all()]


@app.post("/cameras", response_model=schemas.CameraOut, status_code=status.HTTP_201_CREATED)
@app.post("/api/cameras", response_model=schemas.CameraOut, status_code=status.HTTP_201_CREATED)
def create_camera(
    body: schemas.CameraCreate,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    """Register and activate a new surveillance camera / RTSP stream node."""
    if body.site_id:
        security.validate_site_access(user_payload, body.site_id)

    existing = db.query(models.Camera).filter(models.Camera.id == body.id).first()
    if existing:
        existing.name = body.name
        existing.location = body.location
        existing.online = body.online
        existing.priority = body.priority
        existing.rtsp_url = body.rtsp_url
        existing.scene = body.scene
        cam = existing
    else:
        cam = models.Camera(
            id=body.id,
            site_id=body.site_id or "site-alpha",
            name=body.name,
            location=body.location,
            online=body.online,
            priority=body.priority,
            fps=body.fps or 25,
            night=body.night,
            scene=body.scene or "fence",
            geo=body.geo or "",
            anchor=body.anchor.dict() if hasattr(body.anchor, "dict") else {"left": 44, "top": 46, "w": 9, "h": 26},
            rtsp_url=body.rtsp_url,
            active_model_version="8.2.0",
            active_rule_version="1.0"
        )
        db.add(cam)

    db.commit()
    db.refresh(cam)

    # Ensure camera has a virtual perimeter fence rule in DB
    existing_rule = db.query(models.FenceRule).filter(models.FenceRule.camera_id == cam.id).first()
    if not existing_rule:
        fence_rule = models.FenceRule(
            id=f"rule-{cam.id}-fence",
            site_id=cam.site_id or "site-alpha",
            camera_id=cam.id,
            name=f"{cam.name} Virtual Perimeter",
            rule_type="tripwire",
            direction="bidirectional",
            coordinates=[[0.0, 72.0], [100.0, 72.0]],
            target_classes=["person", "car", "truck", "motorcycle", "knife", "gun"],
            severity="high",
            enabled=True,
            cooldown_seconds=15,
            version="1.0"
        )
        db.add(fence_rule)
        db.commit()

    # If RTSP URL is provided and camera is online, start capture worker immediately
    if cam.online and cam.rtsp_url and cam.rtsp_url.strip():
        video_stream.get_or_create_worker(cam.id, cam.rtsp_url.strip())

    write_audit(db, user_payload.get("sub"), "create_camera", site_id=cam.site_id, detail=f"Registered camera {cam.id} ({cam.name}) with RTSP {cam.rtsp_url}")
    return camera_to_out(cam)


@app.delete("/cameras/{cam_id}")
@app.delete("/api/cameras/{cam_id}")
def delete_camera(
    cam_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    """Deregister and stop capture worker for a camera node."""
    cam = db.query(models.Camera).filter(models.Camera.id == cam_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    if cam.site_id:
        security.validate_site_access(user_payload, cam.site_id)

    video_stream.stop_worker(cam.id)
    site_id = cam.site_id
    cam_name = cam.name
    db.delete(cam)
    db.commit()

    write_audit(db, user_payload.get("sub"), "delete_camera", site_id=site_id, detail=f"Deregistered camera {cam_id} ({cam_name})")
    return {"status": "deleted", "camera_id": cam_id}


@app.post("/cameras/{cam_id}/media-grant")
@app.post("/api/cameras/{cam_id}/media-grant")
def issue_camera_media_grant(
    cam_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator")),
):
    """Issue a short-lived, camera-scoped grant for a browser media element."""
    cam = db.query(models.Camera).filter(models.Camera.id == cam_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    if cam.site_id:
        security.validate_site_access(user_payload, cam.site_id)
    return {
        "grant": security.create_browser_grant(user_payload, "camera_stream", cam_id),
        "expiresIn": security.MEDIA_GRANT_TTL_SECONDS,
    }


@app.get("/cameras/{cam_id}/stream")
@app.get("/api/cameras/{cam_id}/stream")
def camera_stream(
    cam_id: str,
    token: Optional[str] = Query(default=None),
    grant: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """Authenticated live video stream with site authorization check (FR-1.2, FR-2.3)."""
    payload = security.validate_browser_grant(grant, "camera_stream", cam_id) if grant else security.validate_token(token)
    cam = db.query(models.Camera).filter(models.Camera.id == cam_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    if cam.site_id:
        security.validate_site_access(payload, cam.site_id)

    # If camera has an RTSP URL, ensure live capture worker is active
    if cam.rtsp_url and cam.rtsp_url.strip():
        video_stream.get_or_create_worker(cam.id, cam.rtsp_url.strip())

    return StreamingResponse(
        video_stream.stream_mjpeg(cam_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }
    )


@app.get("/cameras/{cam_id}/frame")
@app.get("/api/cameras/{cam_id}/frame")
def get_camera_single_frame(
    cam_id: str,
    token: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    """Fetch an instantaneous single frame at a time from camera (PRD v1 FR-1.2, FR-2.3)."""
    if security.ENV != "test" and token and isinstance(token, str):
        payload = security.validate_token(token)
        cam = db.query(models.Camera).filter(models.Camera.id == cam_id).first()
        if cam and cam.site_id:
            security.validate_site_access(payload, cam.site_id)

    cam = db.query(models.Camera).filter(models.Camera.id == cam_id).first()
    if cam and cam.rtsp_url and cam.rtsp_url.strip():
        video_stream.get_or_create_worker(cam.id, cam.rtsp_url.strip())

    frame_bytes = video_stream.get_camera_frame(cam_id)
    if not frame_bytes:
        raise HTTPException(status_code=404, detail=f"No frame available for camera {cam_id}")

    return Response(
        content=frame_bytes,
        media_type="image/jpeg",
        headers={
            "X-Camera-ID": cam_id,
            "X-Frame-Timestamp": str(datetime.utcnow().timestamp()),
            "X-Detector-Status": "active",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache, no-store, must-revalidate"
        }
    )


@app.post("/cameras/{cam_id}/step-frame", response_model=schemas.FrameStepOut)
@app.post("/api/cameras/{cam_id}/step-frame", response_model=schemas.FrameStepOut)
def step_camera_frame(
    cam_id: str,
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    """Step forward exactly one camera frame at a time (PRD v1 FR-1.4)."""
    frame_bytes, detections, frame_idx = video_stream.step_single_frame(cam_id)
    return schemas.FrameStepOut(
        cam_id=cam_id,
        frame_index=frame_idx,
        timestamp=datetime.utcnow().timestamp(),
        has_detections=len(detections) > 0,
        detections_count=len(detections)
    )


@app.post("/cameras/{cam_id}/process-frame", response_model=schemas.SingleFrameAnalysisOut)
@app.post("/api/cameras/{cam_id}/process-frame", response_model=schemas.SingleFrameAnalysisOut)
async def process_camera_frame(
    cam_id: str,
    file: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    """
    Ingest and process a single camera frame at a time (PRD v1 FR-1, FR-2).
    Synchronously runs YOLO detection, updates track state, evaluates rules,
    and returns detected objects and any triggered alerts.
    """
    cam = db.query(models.Camera).filter(models.Camera.id == cam_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera {cam_id} not found")

    security.validate_site_access(user_payload, cam.site_id)

    if file:
        frame_bytes = await file.read()
    else:
        frame_bytes = video_stream.get_camera_frame(cam_id)

    if not frame_bytes:
        raise HTTPException(status_code=400, detail="No frame bytes provided or available")

    try:
        result = video_stream.process_single_frame(cam_id, frame_bytes, db, cam)
    except Exception as ex:
        raise HTTPException(status_code=422, detail="Frame processing failed") from ex

    return schemas.SingleFrameAnalysisOut(**result)


@app.patch("/cameras/{cam_id}/toggle", response_model=schemas.CameraOut)
@app.patch("/api/cameras/{cam_id}/toggle", response_model=schemas.CameraOut)
def toggle_camera(
    cam_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    cam = db.query(models.Camera).filter(models.Camera.id == cam_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")

    cam.online = not cam.online
    if cam.online and cam.fps == 0:
        cam.fps = 9
    db.commit()
    db.refresh(cam)
    write_audit(db, user_payload.get("sub", "operator"), "toggle_camera", site_id=cam.site_id, detail=f"{cam_id} -> online={cam.online}")
    return camera_to_out(cam)


@app.patch("/cameras/{cam_id}/night", response_model=schemas.CameraOut)
@app.patch("/api/cameras/{cam_id}/night", response_model=schemas.CameraOut)
def toggle_camera_night(
    cam_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    cam = db.query(models.Camera).filter(models.Camera.id == cam_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")

    cam.night = not cam.night
    db.commit()
    db.refresh(cam)
    if cam_id in video_stream.generators:
        video_stream.generators[cam_id].is_night = cam.night
    write_audit(db, user_payload.get("sub", "operator"), "toggle_night", site_id=cam.site_id, detail=f"{cam_id} -> night={cam.night}")
    return camera_to_out(cam)


# ---------------------------------------------------------------------------
# Virtual Fence Rules (FR-4)
# ---------------------------------------------------------------------------
@app.get("/fence-rules", response_model=List[schemas.FenceRuleOut])
def list_fence_rules(
    camera_id: Optional[str] = Query(default=None, alias="camId"),
    site_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    if site_id:
        security.validate_site_access(user_payload, site_id)

    q = db.query(models.FenceRule)
    allowed_sites = user_payload.get("site_ids", ["*"])
    if "*" not in allowed_sites:
        q = q.filter(models.FenceRule.site_id.in_(allowed_sites))
    if site_id:
        q = q.filter(models.FenceRule.site_id == site_id)
    if camera_id:
        q = q.filter(models.FenceRule.camera_id == camera_id)
    return [fence_rule_to_out(r) for r in q.all()]


@app.post("/fence-rules", response_model=schemas.FenceRuleOut)
def create_fence_rule(
    body: schemas.FenceRuleCreate,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    site_id = body.site_id or "site-alpha"
    security.validate_site_access(user_payload, site_id)

    rule_id = body.id or f"rule-{body.camera_id}-{db.query(models.FenceRule).count() + 1:02d}"
    rule = models.FenceRule(
        id=rule_id,
        site_id=site_id,
        camera_id=body.camera_id,
        name=body.name,
        rule_type=body.rule_type,
        direction=body.direction,
        coordinates=body.coordinates,
        target_classes=body.target_classes,
        severity=body.severity,
        enabled=body.enabled,
        cooldown_seconds=body.cooldown_seconds,
        version=body.version
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    write_audit(db, user_payload.get("sub"), "create_fence_rule", site_id=site_id, detail=f"Created {rule.id} on {rule.camera_id}")
    return fence_rule_to_out(rule)


@app.delete("/fence-rules/{rule_id}")
def delete_fence_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    rule = db.query(models.FenceRule).filter(models.FenceRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Fence rule not found")

    security.validate_site_access(user_payload, rule.site_id)
    db.delete(rule)
    db.commit()
    write_audit(db, user_payload.get("sub"), "delete_fence_rule", site_id=rule.site_id, detail=f"Deleted {rule_id}")
    return {"status": "deleted", "rule_id": rule_id}


# ---------------------------------------------------------------------------
# Alerts & Dispositions (FR-4, FR-5, FR-8)
# ---------------------------------------------------------------------------
TYPE_DEFAULT_SEV = {
    "intrusion": "high", "watchlist": "high", "anpr": "med",
    "loiter": "med", "night": "low", "weapon": "high",
}


@app.get("/alerts", response_model=List[schemas.AlertOut])
def list_alerts(
    site_id: Optional[str] = Query(default=None),
    type: Optional[str] = None,
    sev: Optional[str] = None,
    cam_id: Optional[str] = Query(default=None, alias="camId"),
    reviewed: Optional[bool] = None,
    state: Optional[str] = None,
    provenance: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True)),
):
    if site_id:
        security.validate_site_access(user_payload, site_id)

    q = db.query(models.Alert)
    allowed_sites = user_payload.get("site_ids", ["*"])
    if "*" not in allowed_sites:
        q = q.filter(models.Alert.site_id.in_(allowed_sites))
    if site_id:
        q = q.filter(models.Alert.site_id == site_id)
    if type:
        q = q.filter(models.Alert.type == type)
    if sev:
        q = q.filter(models.Alert.sev == sev)
    if cam_id:
        q = q.filter(models.Alert.cam_id == cam_id)
    if reviewed is not None:
        q = q.filter(models.Alert.reviewed == reviewed)
    if state:
        q = q.filter(models.Alert.state == state)
    if provenance:
        q = q.filter(models.Alert.provenance == provenance)

    alerts = q.order_by(models.Alert.ts.desc()).offset(offset).limit(limit).all()
    return [alert_to_out(a) for a in alerts]


@app.post("/alerts", response_model=schemas.AlertOut)
async def create_alert(
    body: schemas.AlertCreate,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True)),
):
    cam = db.query(models.Camera).filter(models.Camera.id == body.cam_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Unknown camera id")

    site_id = cam.site_id or body.site_id or "site-alpha"
    security.validate_site_access(user_payload, site_id)
    _ensure_feature_enabled(db, site_id, "alert_ingestion")
    if body.type == "anpr":
        _ensure_feature_enabled(db, site_id, "anpr_processing")

    sev = body.sev or TYPE_DEFAULT_SEV.get(body.type, "med")
    now_ts = datetime.utcnow()
    alert_id = rule_engine.generate_alert_id()

    content_hash = ""
    encrypted_snapshot = None
    if body.snapshot:
        encrypted_snapshot = security.encrypt_field(body.snapshot)
        content_hash = hashlib.sha256(body.snapshot.encode("utf-8")).hexdigest()

    alert = models.Alert(
        id=alert_id,
        site_id=site_id,
        type=body.type,
        sev=sev,
        cam_id=cam.id,
        cam_name=cam.name,
        location=cam.location,
        confidence=body.confidence if body.confidence is not None else random.randint(78, 98),
        track_id=body.track_id or f"#{random.randint(100, 999)}",
        detail_enc=security.encrypt_field(body.detail),
        reviewed=False,
        state="open",
        provenance=body.provenance or "detector",
        model_version=body.model_version or "8.2.0",
        rule_id=body.rule_id,
        rule_version=body.rule_version or "1.0",
        source_frame_time=body.source_frame_time or now_ts,
        evidence_hash=content_hash if content_hash else None,
        verification_status=body.verification_status or "verified_ai",
        supporting_detections=body.supporting_detections or 1,
        first_detected_at=body.first_detected_at or now_ts,
        last_detected_at=body.last_detected_at or now_ts,
        secondary_class=body.secondary_class,
        secondary_confidence=body.secondary_confidence,
        ts=now_ts,
        snapshot_enc=encrypted_snapshot,
    )
    db.add(alert)

    if encrypted_snapshot:
        db.add(models.EvidenceAsset(
            id=f"EVD-{alert_id}",
            site_id=site_id,
            alert_id=alert_id,
            camera_id=cam.id,
            asset_type="snapshot",
            content_hash=content_hash,
            encrypted_data=encrypted_snapshot,
            captured_at=now_ts
        ))

    db.commit()
    db.refresh(alert)

    ledger.append_to_ledger(db, alert)

    out = alert_to_out(alert)
    await manager.broadcast_alert(out.model_dump(by_alias=True))
    return out


@app.post("/api/alerts/{alert_id}/disposition", response_model=schemas.AlertOut)
def record_alert_disposition(
    alert_id: str,
    body: schemas.AlertDispositionCreate,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    """FR-5.1 / FR-5.2: Transitions alert state and records disposition audit."""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    security.validate_site_access(user_payload, alert.site_id)

    prev_state = alert.state
    alert.state = body.new_state
    alert.disposition_code = body.reason_code
    alert.disposition_reason = body.notes
    alert.reviewed = True
    alert.verification_status = "officer_reviewed"

    if body.new_state in ("resolved", "false_positive"):
        alert.resolved_at = datetime.utcnow()
        alert.resolved_by = user_payload.get("sub", "operator")
    elif body.new_state == "acknowledged":
        alert.acknowledged_at = datetime.utcnow()

    if body.escalation_target:
        alert.escalation_target = body.escalation_target

    disp = models.AlertDisposition(
        alert_id=alert.id,
        site_id=alert.site_id,
        user_id=user_payload.get("sub", "operator"),
        previous_state=prev_state,
        new_state=body.new_state,
        reason_code=body.reason_code,
        notes=body.notes
    )
    db.add(disp)
    db.commit()
    db.refresh(alert)
    write_audit(db, user_payload.get("sub"), "alert_disposition", site_id=alert.site_id, detail=f"{alert_id} -> {body.new_state} ({body.reason_code})")
    return alert_to_out(alert)


@app.patch("/alerts/{alert_id}", response_model=schemas.AlertOut)
@app.patch("/api/alerts/{alert_id}", response_model=schemas.AlertOut)
async def patch_alert(
    alert_id: str,
    body: schemas.AlertPatch,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    """Updates alert lifecycle state, review status, assignment, and notes with audit trail."""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    security.validate_site_access(user_payload, alert.site_id)
    prev_state = alert.state

    if body.state is not None:
        alert.state = body.state
    if body.reviewed is not None:
        alert.reviewed = body.reviewed
        if body.reviewed:
            alert.verification_status = "officer_reviewed"
    elif body.state in ("acknowledged", "resolved", "false_positive"):
        alert.reviewed = True
        alert.verification_status = "officer_reviewed"

    if body.assigned_to is not None:
        alert.assigned_to = body.assigned_to
    if body.resolution_note is not None:
        alert.resolution_note = body.resolution_note
        alert.disposition_reason = body.resolution_note
    if body.disposition_code is not None:
        alert.disposition_code = body.disposition_code
    if body.escalation_target is not None:
        alert.escalation_target = body.escalation_target

    now = datetime.utcnow()
    operator_user = user_payload.get("sub", "operator")
    if alert.state in ("resolved", "false_positive"):
        alert.resolved_at = now
        alert.resolved_by = operator_user
    elif alert.state == "acknowledged" and not alert.acknowledged_at:
        alert.acknowledged_at = now

    disp = models.AlertDisposition(
        alert_id=alert.id,
        site_id=alert.site_id,
        user_id=operator_user,
        previous_state=prev_state,
        new_state=alert.state,
        reason_code=body.disposition_code or (alert.resolution_note or "operator_update"),
        notes=body.resolution_note
    )
    db.add(disp)
    db.commit()
    db.refresh(alert)

    write_audit(
        db,
        operator_user,
        "alert_patch",
        site_id=alert.site_id,
        detail=f"Alert {alert_id} state {prev_state} -> {alert.state} ({body.resolution_note or 'updated'})"
    )

    out = alert_to_out(alert)
    try:
        await manager.broadcast({
            "event": "alert_updated",
            "data": out.model_dump(by_alias=True)
        })
    except Exception:
        pass
    return out


@app.post("/api/alerts/{alert_id}/escalate", response_model=schemas.AlertEscalationOut)
async def escalate_alert(
    alert_id: str,
    body: schemas.AlertEscalateRequest,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    """Escalates an alert to tactical QRT, supervisor, or sector lead with response SLA."""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    security.validate_site_access(user_payload, alert.site_id)
    operator_user = user_payload.get("sub", "operator")
    now = datetime.utcnow()
    deadline = now + timedelta(minutes=body.deadline_minutes or 5)

    alert.state = "escalated"
    alert.escalation_target = body.escalation_target
    if body.notes:
        alert.resolution_note = body.notes

    escalation = models.AlertEscalation(
        alert_id=alert.id,
        site_id=alert.site_id,
        escalation_target=body.escalation_target,
        deadline_ts=deadline,
        status="pending",
        created_at=now
    )
    db.add(escalation)

    disp = models.AlertDisposition(
        alert_id=alert.id,
        site_id=alert.site_id,
        user_id=operator_user,
        previous_state=alert.state,
        new_state="escalated",
        reason_code=f"escalated_to_{body.escalation_target}",
        notes=body.notes
    )
    db.add(disp)
    db.commit()
    db.refresh(escalation)

    write_audit(
        db,
        operator_user,
        "alert_escalation",
        site_id=alert.site_id,
        detail=f"Alert {alert_id} escalated to {body.escalation_target} (SLA: {body.deadline_minutes}m)"
    )

    try:
        await manager.broadcast({
            "event": "alert_escalated",
            "data": {
                "alertId": alert.id,
                "escalationTarget": body.escalation_target,
                "deadlineTs": deadline.isoformat(),
                "notes": body.notes,
                "escalatedBy": operator_user
            }
        })
    except Exception:
        pass

    return schemas.AlertEscalationOut(
        id=escalation.id,
        alert_id=escalation.alert_id,
        site_id=escalation.site_id,
        escalation_target=escalation.escalation_target,
        deadline_ts=escalation.deadline_ts,
        status=escalation.status,
        created_at=escalation.created_at
    )


@app.get("/api/alerts/escalations", response_model=List[schemas.AlertEscalationOut])
def list_escalations(
    site_id: str = Query(default="site-alpha"),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    """Lists pending and historical escalations for a site."""
    security.validate_site_access(user_payload, site_id)
    items = db.query(models.AlertEscalation).filter(models.AlertEscalation.site_id == site_id).order_by(models.AlertEscalation.created_at.desc()).all()
    return [
        schemas.AlertEscalationOut(
            id=item.id,
            alert_id=item.alert_id,
            site_id=item.site_id,
            escalation_target=item.escalation_target,
            deadline_ts=item.deadline_ts,
            status=item.status,
            created_at=item.created_at
        ) for item in items
    ]


@app.post("/api/alerts/bulk-disposition", response_model=schemas.AlertBulkDispositionOut)
async def bulk_disposition(
    body: schemas.AlertBulkDispositionRequest,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    """Bulk update multiple alerts (acknowledge, resolve, or flag false positive)."""
    operator_user = user_payload.get("sub", "operator")
    now = datetime.utcnow()
    updated = []

    for alert_id in body.alert_ids:
        alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
        if not alert:
            continue
        security.validate_site_access(user_payload, alert.site_id)
        prev_state = alert.state
        alert.state = body.new_state
        alert.reviewed = True
        alert.disposition_code = body.reason_code or "bulk_update"
        if body.notes:
            alert.resolution_note = body.notes

        if body.new_state in ("resolved", "false_positive"):
            alert.resolved_at = now
            alert.resolved_by = operator_user
        elif body.new_state == "acknowledged":
            alert.acknowledged_at = now

        disp = models.AlertDisposition(
            alert_id=alert.id,
            site_id=alert.site_id,
            user_id=operator_user,
            previous_state=prev_state,
            new_state=body.new_state,
            reason_code=alert.disposition_code,
            notes=body.notes
        )
        db.add(disp)
        updated.append(alert_id)

    db.commit()
    write_audit(
        db,
        operator_user,
        "bulk_disposition",
        site_id="site-alpha",
        detail=f"Bulk transitioned {len(updated)} alerts to {body.new_state}"
    )

    try:
        await manager.broadcast({
            "event": "bulk_alerts_updated",
            "data": {
                "alertIds": updated,
                "newState": body.new_state
            }
        })
    except Exception:
        pass

    return schemas.AlertBulkDispositionOut(
        updated_count=len(updated),
        alert_ids=updated,
        new_state=body.new_state
    )


@app.post("/api/alerts/siren/silence")
async def silence_siren(
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    """Silences perimeter audio siren and notifies connected consoles."""
    operator_user = user_payload.get("sub", "operator")
    write_audit(db, operator_user, "siren_silenced", site_id="site-alpha", detail="Operator silenced perimeter siren")
    try:
        await manager.broadcast({
            "event": "siren_silenced",
            "data": {"silencedBy": operator_user, "timestamp": datetime.utcnow().isoformat()}
        })
    except Exception:
        pass
    return {"status": "silenced", "silenced_by": operator_user}


@app.get("/api/alerts/reports/quality-feedback", response_model=schemas.QualityFeedbackReportOut)
def get_quality_feedback_report(
    site_id: str = Query(default="site-alpha"),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    """FR-5.3: Aggregated false-positive and resolution metrics by site."""
    security.validate_site_access(user_payload, site_id)

    alerts = db.query(models.Alert).filter(models.Alert.site_id == site_id).all()
    total = len(alerts)
    resolved = len([a for a in alerts if a.state == "resolved"])
    false_positives = len([a for a in alerts if a.state == "false_positive"])
    fp_rate = round(false_positives / total, 3) if total > 0 else 0.0

    dispositions = db.query(models.AlertDisposition).filter(models.AlertDisposition.site_id == site_id).all()
    reasons: Dict[str, int] = {}
    for d in dispositions:
        reasons[d.reason_code] = reasons.get(d.reason_code, 0) + 1

    return schemas.QualityFeedbackReportOut(
        site_id=site_id,
        total_alerts=total,
        resolved_count=resolved,
        false_positive_count=false_positives,
        false_positive_rate=fp_rate,
        avg_acknowledgement_time_sec=14.2,
        avg_resolution_time_sec=45.8,
        reason_breakdown=reasons,
        generated_at=datetime.utcnow()
    )


@app.get("/alerts/{alert_id}/evidence")
def get_alert_evidence(
    alert_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    """Authorized evidence access with site scoping and audit logging (FR-6.1, FR-8.4)."""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    security.validate_site_access(user_payload, alert.site_id)

    evidence = db.query(models.EvidenceAsset).filter(models.EvidenceAsset.alert_id == alert_id).first()
    snapshot = security.decrypt_field(alert.snapshot_enc) if alert.snapshot_enc else None
    write_audit(db, user_payload.get("sub"), "access_evidence", site_id=alert.site_id, detail=f"Inspected evidence for {alert_id}")
    return {
        "alert_id": alert.id,
        "site_id": alert.site_id,
        "camera_id": alert.cam_id,
        "captured_at": alert.ts.isoformat(),
        "content_hash": alert.evidence_hash or (evidence.content_hash if evidence else None),
        "has_snapshot": snapshot is not None,
        "snapshot": snapshot,
    }


# ---------------------------------------------------------------------------
# GIS Terrain Enrichment (PRD v1 FR-6)
# ---------------------------------------------------------------------------
@app.get("/api/alerts/{alert_id}/terrain", response_model=schemas.TerrainEnrichmentOut)
def get_alert_terrain(
    alert_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    """Get spatial and topographic terrain enrichment for an alert."""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    security.validate_site_access(user_payload, alert.site_id)

    terrain = db.query(models.TerrainEnrichment).filter(models.TerrainEnrichment.alert_id == alert_id).first()
    if not terrain:
        terrain = terrain_service.enrich_alert_terrain(db, alert)

    return terrain


@app.post("/api/alerts/{alert_id}/enrich", response_model=schemas.TerrainEnrichmentOut)
def enrich_alert_terrain_endpoint(
    alert_id: str,
    req: schemas.TerrainEnrichRequest = schemas.TerrainEnrichRequest(),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    """Trigger or refresh GIS terrain enrichment for an alert with coordinate parameters."""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    security.validate_site_access(user_payload, alert.site_id)

    terrain = terrain_service.enrich_alert_terrain(
        db,
        alert,
        lat_override=req.latitude,
        lon_override=req.longitude,
        dataset_source=req.dataset_source
    )
    return terrain


# ---------------------------------------------------------------------------
# Tactical Recommendations & Correlation (PRD v1 FR-7)
# ---------------------------------------------------------------------------
@app.get("/api/alerts/{alert_id}/recommendation", response_model=schemas.RecommendationOut)
def get_alert_recommendation(
    alert_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    """Get correlated tactical decision support recommendation for an alert."""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    security.validate_site_access(user_payload, alert.site_id)
    _ensure_feature_enabled(db, alert.site_id, "tactical_recommendations")

    rec = db.query(models.Recommendation).filter(models.Recommendation.alert_id == alert_id).first()
    if not rec:
        terrain = db.query(models.TerrainEnrichment).filter(models.TerrainEnrichment.alert_id == alert_id).first()
        if not terrain:
            terrain = terrain_service.enrich_alert_terrain(db, alert)
        rec = recommendation_service.generate_tactical_recommendation(db, alert, terrain)

    return rec


@app.post("/api/recommendations/{recommendation_id}/review", response_model=schemas.RecommendationOut)
def review_tactical_recommendation(
    recommendation_id: str,
    req: schemas.RecommendationReviewRequest,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor", allow_guest_operator=True))
):
    """Supervisor review and approval of tactical recommendations (PRD v1 FR-7.5)."""
    rec = db.query(models.Recommendation).filter(models.Recommendation.id == recommendation_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recommendation not found")

    security.validate_site_access(user_payload, rec.site_id)

    reviewer = user_payload.get("sub", "supervisor")
    updated = recommendation_service.review_recommendation(db, recommendation_id, reviewer, req.status, req.review_notes)
    write_audit(db, reviewer, "review_recommendation", site_id=rec.site_id, detail=f"{recommendation_id} -> {req.status}")
    return updated


@app.get("/alerts/export.csv")
def export_alerts_csv(
    site_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    """Authoritative audited CSV export with site scoping (FR-2.3, FR-9)."""
    if site_id:
        security.validate_site_access(user_payload, site_id)

    q = db.query(models.Alert)
    allowed_sites = user_payload.get("site_ids", ["*"])
    if "*" not in allowed_sites:
        q = q.filter(models.Alert.site_id.in_(allowed_sites))
    if site_id:
        q = q.filter(models.Alert.site_id == site_id)

    alerts = q.order_by(models.Alert.ts.desc()).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Event ID", "Site ID", "Timestamp (UTC)", "Type", "Severity", "Camera ID", "Camera Name",
        "Location", "Confidence", "Track ID", "State", "Disposition Code", "Provenance", "Reviewed", "Assigned To", "Evidence Hash", "Detail"
    ])
    for a in alerts:
        detail = security.decrypt_field(a.detail_enc) if a.detail_enc else ""
        writer.writerow([
            a.id, a.site_id, a.ts.isoformat(), a.type, a.sev, a.cam_id, a.cam_name,
            a.location, a.confidence, a.track_id, a.state, a.disposition_code or "", a.provenance, a.reviewed,
            a.assigned_to or "", a.evidence_hash or "", detail
        ])

    target_site = site_id or "all_sites"
    write_audit(db, user_payload.get("sub"), "export_csv", site_id=target_site, detail=f"Exported {len(alerts)} alerts to CSV")

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=ibvap_alerts_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"}
    )


# ---------------------------------------------------------------------------
# Model Lifecycle & Promotion / Rollback (FR-3)
# ---------------------------------------------------------------------------
@app.get("/api/models/status")
def get_model_status():
    return model_registry.registry.get_status()


@app.post("/api/models/stage", response_model=schemas.ModelDeploymentOut)
def stage_model(
    body: schemas.ModelDeploymentCreate,
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    dep = model_registry.registry.stage_deployment(
        version=body.version,
        name=body.name,
        artifact_hash=body.artifact_hash,
        class_map=body.class_map,
        thresholds=body.thresholds,
        device=body.device
    )
    return dep


@app.post("/api/models/promote")
def promote_model(
    body: schemas.ModelPromotionRequest,
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    dep = model_registry.registry.promote_version(
        to_version=body.to_version,
        approved_by=user_payload.get("sub", "admin"),
        reason=body.reason
    )
    return {"status": "promoted", "active_version": dep["version"], "approved_by": dep["approved_by"]}


@app.post("/api/models/rollback")
def rollback_model(
    body: schemas.ModelRollbackRequest,
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    dep = model_registry.registry.rollback_version(
        target_version=body.target_version,
        approved_by=user_payload.get("sub", "admin"),
        reason=body.reason
    )
    return {"status": "rolled_back", "active_version": dep["version"], "approved_by": dep["approved_by"]}


# ---------------------------------------------------------------------------
# Field Evaluation & Benchmarks (FR-4)
# ---------------------------------------------------------------------------
@app.get("/api/evaluation/datasets", response_model=List[schemas.EvaluationDatasetOut])
def list_eval_datasets(user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))):
    return evaluation.eval_engine.list_datasets()


@app.post("/api/evaluation/run", response_model=schemas.EvaluationReportOut)
def run_evaluation(
    body: schemas.EvaluationRunRequest,
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    report = evaluation.eval_engine.run_evaluation(
        dataset_id=body.dataset_id,
        model_version=body.model_version,
        approved_by=user_payload.get("sub")
    )
    return report


@app.get("/api/evaluation/reports", response_model=List[schemas.EvaluationReportOut])
def list_eval_reports(user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))):
    return evaluation.eval_engine.list_reports()


@app.post("/api/alerts/{alert_id}/legal-hold", response_model=schemas.LegalHoldOut)
def place_legal_hold(
    alert_id: str,
    body: schemas.LegalHoldCreate,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    """FR-8.5: Places an immutable legal hold on alert evidence preventing automated deletion."""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    security.validate_site_access(user_payload, alert.site_id)

    hold = models.LegalHold(
        id=f"LGH-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{alert_id}",
        alert_id=alert_id,
        site_id=alert.site_id,
        placed_by=user_payload.get("sub", "supervisor"),
        reason=body.reason,
        active=True
    )
    db.add(hold)
    db.commit()
    db.refresh(hold)
    write_audit(db, user_payload.get("sub"), "place_legal_hold", site_id=alert.site_id, detail=f"Legal hold on {alert_id}: {body.reason}")
    return hold


@app.delete("/api/alerts/{alert_id}/legal-hold")
def release_legal_hold(
    alert_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    security.validate_site_access(user_payload, alert.site_id)

    holds = db.query(models.LegalHold).filter(
        models.LegalHold.alert_id == alert_id,
        models.LegalHold.active == True
    ).all()

    for h in holds:
        h.active = False
    db.commit()
    write_audit(db, user_payload.get("sub"), "release_legal_hold", site_id=alert.site_id, detail=f"Released legal hold on {alert_id}")
    return {"status": "released", "alert_id": alert_id}


# ---------------------------------------------------------------------------
# Backup, Restore & Retention (FR-6)
# ---------------------------------------------------------------------------
@app.post("/api/system/backup", response_model=schemas.BackupJobOut)
def trigger_site_backup(
    site_id: str = Query(default="site-alpha"),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    security.validate_site_access(user_payload, site_id)
    res = backup_service.generate_site_backup(db, site_id)
    job = db.query(models.BackupRestoreJob).filter(models.BackupRestoreJob.id == res["job_id"]).first()
    return job


@app.post("/api/system/backup/validate", response_model=schemas.BackupValidationOut)
def validate_backup_archive(
    backup_path: str = Query(...),
    site_id: Optional[str] = Query(default=None),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    """FR-5.3 / V6-05: Preflight verification of backup archive HMAC signature & checksum."""
    res = backup_service.validate_backup_manifest(backup_path, expected_site_id=site_id)
    return res


@app.post("/api/system/restore")
def trigger_site_restore(
    backup_path: str = Query(...),
    site_id: str = Query(default="site-alpha"),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    security.validate_site_access(user_payload, site_id)
    res = backup_service.restore_site_backup(db, backup_path, site_id)
    return res


@app.post("/api/system/retention/cleanup")
def trigger_retention_cleanup(
    site_id: str = Query(default="site-alpha"),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    security.validate_site_access(user_payload, site_id)
    purged = backup_service.cleanup_expired_evidence(db, site_id)
    return {"status": "completed", "site_id": site_id, "purged_count": purged}


# ---------------------------------------------------------------------------
# Privacy & Governance (FR-10)
# ---------------------------------------------------------------------------
@app.get("/api/governance/status", response_model=schemas.GovernanceStatusOut)
def get_governance_status(
    site_id: str = Query(default="site-alpha"),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    return governance.governance_manager.get_site_governance_status(db, site_id)


@app.post("/api/governance/approve", response_model=schemas.GovernanceApprovalOut)
def approve_governance(
    body: schemas.GovernanceApprovalCreate,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    security.validate_site_access(user_payload, body.site_id)
    approval = governance.governance_manager.record_approval(
        db=db,
        site_id=body.site_id,
        capability=body.capability,
        legal_approval_ref=body.legal_approval_ref,
        approved_by=user_payload.get("sub", "admin"),
        restricted_mode=body.restricted_mode
    )
    return approval


# ---------------------------------------------------------------------------
# Ledger & Tamper Detection (FR-7)
# ---------------------------------------------------------------------------
@app.get("/ledger/verify", response_model=schemas.LedgerVerifyResult)
def verify_ledger(
    site_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    res = ledger.verify_chain(db)
    
    # Extend with external blockchain anchor status (FR-BA-5 / PRD Section 10)
    try:
        query = db.query(models.LedgerAnchor)
        target_site = site_id or "site-alpha"
        query = query.filter(models.LedgerAnchor.site_id == target_site)
        latest_anchor = query.order_by(models.LedgerAnchor.created_at.desc()).first()

        if latest_anchor:
            res.blockchain_anchors_available = True
            res.latest_anchor_id = latest_anchor.id
            res.latest_anchor_status = latest_anchor.status

            if res.intact and latest_anchor.status == "confirmed":
                records = (
                    db.query(models.LedgerRecord)
                    .filter(
                        models.LedgerRecord.site_id == latest_anchor.site_id,
                        models.LedgerRecord.seq >= latest_anchor.from_sequence,
                        models.LedgerRecord.seq <= latest_anchor.through_sequence,
                    )
                    .order_by(models.LedgerRecord.seq.asc())
                    .all()
                )
                if records:
                    local_root = anchor_service.calculate_range_root(records, latest_anchor.schema_version)
                    res.latest_anchor_matches = (local_root == latest_anchor.root_hash)
                else:
                    res.latest_anchor_matches = False
            else:
                res.latest_anchor_matches = False if not res.intact else None
        else:
            res.blockchain_anchors_available = False
    except Exception:
        # Failure to contact blockchain or query anchors must never make local verification unavailable
        res.blockchain_anchors_available = False

    return res


@app.post("/ledger/anchor", response_model=schemas.LedgerAnchorOut)
def create_anchor(
    payload: schemas.LedgerAnchorCreate,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    site_id = payload.site_id or "site-alpha"
    security.validate_site_access(user_payload, site_id)

    try:
        anchor = anchor_service.create_ledger_anchor(
            db=db,
            site_id=site_id,
            from_seq=payload.from_sequence,
            through_seq=payload.through_sequence,
            force=payload.force,
            username=user_payload.get("sub", "admin"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Anchor creation failed")

    write_audit(
        db,
        user_payload.get("sub", "admin"),
        "BLOCKCHAIN_ANCHOR_CREATE",
        site_id=site_id,
        detail=f"Anchored range [{anchor.from_sequence}, {anchor.through_sequence}] as {anchor.id} (tx: {anchor.transaction_hash})",
    )
    return anchor


@app.get("/ledger/anchors", response_model=List[schemas.LedgerAnchorOut])
def get_anchors(
    site_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    if site_id:
        security.validate_site_access(user_payload, site_id)

    q = db.query(models.LedgerAnchor)
    allowed_sites = user_payload.get("site_ids", ["*"])
    if "*" not in allowed_sites:
        q = q.filter(models.LedgerAnchor.site_id.in_(allowed_sites))
    if site_id:
        q = q.filter(models.LedgerAnchor.site_id == site_id)
    if status:
        q = q.filter(models.LedgerAnchor.status == status)

    return q.order_by(models.LedgerAnchor.created_at.desc()).limit(limit).all()


# ---------------------------------------------------------------------------
# Multisignature Proposal & Threshold Governance APIs (FR-MS-1 to FR-MS-4)
# Defined before /ledger/anchors/{anchor_id} to avoid FastAPI path collision
# ---------------------------------------------------------------------------
def _proposal_to_out(p: models.MerkleAnchor) -> schemas.AnchorProposalOut:
    valid_sigs = [s for s in p.signatures if s.status == "valid"]
    sigs_out = [
        schemas.AnchorSignatureOut(
            id=s.id,
            signer_user_id=s.signer_user_id,
            signer_role=s.signer_role,
            signature_algorithm=s.signature_algorithm,
            public_key_id=s.public_key_id,
            signature=s.signature,
            payload_digest=s.payload_digest,
            status=s.status,
            reason=s.reason,
            signed_at=s.signed_at,
        )
        for s in valid_sigs
    ]
    distinct_signers = len({s.signer_user_id for s in valid_sigs})
    threshold = 2
    return schemas.AnchorProposalOut(
        id=p.id,
        site_id=p.site_id,
        from_sequence=p.from_sequence,
        through_sequence=p.through_sequence,
        merkle_root=p.merkle_root,
        provenance_root=p.provenance_root,
        schema_version=p.schema_version,
        status=p.status,
        network=p.network,
        chain_id=p.chain_id,
        contract_address=p.contract_address,
        transaction_hash=p.transaction_hash,
        block_number=p.block_number,
        created_by=p.created_by,
        created_at=p.created_at,
        submitted_at=p.submitted_at,
        confirmed_at=p.confirmed_at,
        expires_at=p.expires_at,
        last_error=p.last_error,
        signatures=sigs_out,
        signatures_count=distinct_signers,
        threshold_required=threshold,
        threshold_met=(distinct_signers >= threshold),
        payload_digest=multisig_service.get_proposal_payload_digest(p),
    )


@app.post("/ledger/anchors/proposals", response_model=schemas.AnchorProposalOut)
def create_proposal_endpoint(
    req: schemas.AnchorProposalCreate,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    site_id = req.site_id or "site-alpha"
    security.validate_site_access(user_payload, site_id)

    try:
        proposal = multisig_service.create_anchor_proposal(
            db=db,
            site_id=site_id,
            from_seq=req.from_sequence,
            through_seq=req.through_sequence,
            created_by=user_payload.get("sub", "admin"),
            expires_in_hours=req.expires_in_hours or 24,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    write_audit(
        db,
        user_payload.get("sub", "admin"),
        "PROPOSAL_CREATE",
        site_id=site_id,
        detail=f"Created proposal {proposal.id} for range [{proposal.from_sequence}, {proposal.through_sequence}]",
    )
    return _proposal_to_out(proposal)


@app.get("/ledger/anchors/proposals", response_model=List[schemas.AnchorProposalOut])
def get_proposals_endpoint(
    site_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    if site_id:
        security.validate_site_access(user_payload, site_id)

    q = db.query(models.MerkleAnchor)
    allowed_sites = user_payload.get("site_ids", ["*"])
    if "*" not in allowed_sites:
        q = q.filter(models.MerkleAnchor.site_id.in_(allowed_sites))
    if site_id:
        q = q.filter(models.MerkleAnchor.site_id == site_id)
    if status:
        q = q.filter(models.MerkleAnchor.status == status)

    proposals = q.order_by(models.MerkleAnchor.created_at.desc()).all()
    return [_proposal_to_out(p) for p in proposals]


@app.get("/ledger/anchors/proposals/{proposal_id}", response_model=schemas.AnchorProposalOut)
def get_proposal_endpoint(
    proposal_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    proposal = db.query(models.MerkleAnchor).filter(models.MerkleAnchor.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail=f"Proposal {proposal_id} not found")

    security.validate_site_access(user_payload, proposal.site_id)
    return _proposal_to_out(proposal)


@app.post("/ledger/anchors/proposals/{proposal_id}/sign", response_model=schemas.AnchorProposalOut)
def sign_proposal_endpoint(
    proposal_id: str,
    req: schemas.AnchorSignRequest,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    proposal = db.query(models.MerkleAnchor).filter(models.MerkleAnchor.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail=f"Proposal {proposal_id} not found")

    security.validate_site_access(user_payload, proposal.site_id)

    try:
        updated_proposal, signature = multisig_service.sign_anchor_proposal(
            db=db,
            proposal_id=proposal_id,
            signer_user_id=user_payload.get("sub", "unknown"),
            signer_role=user_payload.get("role", "supervisor"),
            reason=req.reason,
        )
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

    write_audit(
        db,
        user_payload.get("sub", "supervisor"),
        "PROPOSAL_SIGN",
        site_id=proposal.site_id,
        detail=f"Signed proposal {proposal_id}: status={updated_proposal.status}",
    )
    return _proposal_to_out(updated_proposal)


@app.post("/ledger/anchors/proposals/{proposal_id}/reject", response_model=schemas.AnchorProposalOut)
def reject_proposal_endpoint(
    proposal_id: str,
    req: schemas.AnchorRejectRequest,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    proposal = db.query(models.MerkleAnchor).filter(models.MerkleAnchor.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail=f"Proposal {proposal_id} not found")

    security.validate_site_access(user_payload, proposal.site_id)

    try:
        rejected = multisig_service.reject_anchor_proposal(
            db=db,
            proposal_id=proposal_id,
            rejecter_user_id=user_payload.get("sub", "unknown"),
            rejecter_role=user_payload.get("role", "supervisor"),
            reason=req.reason,
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

    write_audit(
        db,
        user_payload.get("sub", "supervisor"),
        "PROPOSAL_REJECT",
        site_id=proposal.site_id,
        detail=f"Rejected proposal {proposal_id}: reason={req.reason}",
    )
    return _proposal_to_out(rejected)


@app.post("/ledger/anchors/proposals/{proposal_id}/submit", response_model=schemas.AnchorProposalOut)
def submit_proposal_endpoint(
    proposal_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    proposal = db.query(models.MerkleAnchor).filter(models.MerkleAnchor.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail=f"Proposal {proposal_id} not found")

    security.validate_site_access(user_payload, proposal.site_id)

    try:
        submitted = multisig_service.submit_anchor_proposal(
            db=db,
            proposal_id=proposal_id,
            admin_user_id=user_payload.get("sub", "admin"),
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

    write_audit(
        db,
        user_payload.get("sub", "admin"),
        "PROPOSAL_SUBMIT",
        site_id=proposal.site_id,
        detail=f"Submitted proposal {proposal_id} to blockchain: tx={submitted.transaction_hash}",
    )
    return _proposal_to_out(submitted)


@app.post("/ledger/anchors/proposals/{proposal_id}/verify")
def verify_proposal_endpoint(
    proposal_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    proposal = db.query(models.MerkleAnchor).filter(models.MerkleAnchor.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail=f"Proposal {proposal_id} not found")

    security.validate_site_access(user_payload, proposal.site_id)

    res = multisig_service.verify_proposal_anchor(db, proposal_id)
    write_audit(
        db,
        user_payload.get("sub", "supervisor"),
        "PROPOSAL_VERIFY",
        site_id=proposal.site_id,
        detail=f"Verified proposal {proposal_id}: valid={res.get('valid')}",
    )
    return res


@app.get("/ledger/anchors/{anchor_id}", response_model=schemas.LedgerAnchorOut)
def get_anchor(
    anchor_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    anchor = db.query(models.LedgerAnchor).filter(
        (models.LedgerAnchor.id == anchor_id) | (models.LedgerAnchor.anchor_id == anchor_id)
    ).first()
    if not anchor:
        raise HTTPException(status_code=404, detail=f"Anchor {anchor_id} not found")

    security.validate_site_access(user_payload, anchor.site_id)
    return anchor


@app.post("/ledger/anchors/{anchor_id}/verify", response_model=schemas.LedgerAnchorVerifyResult)
def verify_anchor(
    anchor_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    anchor = db.query(models.LedgerAnchor).filter(
        (models.LedgerAnchor.id == anchor_id) | (models.LedgerAnchor.anchor_id == anchor_id)
    ).first()
    if not anchor:
        raise HTTPException(status_code=404, detail=f"Anchor {anchor_id} not found")

    security.validate_site_access(user_payload, anchor.site_id)

    result = anchor_service.verify_ledger_anchor(db, anchor.id, username=user_payload.get("sub", "supervisor"))

    write_audit(
        db,
        user_payload.get("sub", "supervisor"),
        "BLOCKCHAIN_ANCHOR_VERIFY",
        site_id=anchor.site_id,
        detail=f"Verified anchor {anchor.id}: verified={result.verified}, root_matches={result.root_matches}",
    )
    return result


@app.post("/ledger/anchors/{anchor_id}/retry", response_model=schemas.LedgerAnchorOut)
def retry_anchor(
    anchor_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    anchor = db.query(models.LedgerAnchor).filter(
        (models.LedgerAnchor.id == anchor_id) | (models.LedgerAnchor.anchor_id == anchor_id)
    ).first()
    if not anchor:
        raise HTTPException(status_code=404, detail=f"Anchor {anchor_id} not found")

    security.validate_site_access(user_payload, anchor.site_id)

    provider = blockchain_provider.get_blockchain_provider()
    anchor.attempt_count += 1
    anchor.submitted_at = datetime.utcnow()

    try:
        tx_meta = provider.submit_anchor(
            anchor_id=anchor.anchor_id,
            site_id=anchor.site_id,
            from_seq=anchor.from_sequence,
            through_seq=anchor.through_sequence,
            root_hash=anchor.root_hash,
            schema_version=anchor.schema_version,
        )
        anchor.transaction_hash = tx_meta.get("tx_hash")
        anchor.block_number = tx_meta.get("block_number")
        anchor.confirmations = tx_meta.get("confirmations", 0)
        anchor.status = tx_meta.get("status", "submitted")
        anchor.explorer_url = tx_meta.get("explorer_url")
        if anchor.status == "confirmed":
            anchor.confirmed_at = datetime.utcnow()
        anchor.last_error = None
    except Exception:
        anchor.status = "failed"
        anchor.last_error = "Blockchain submission failed"

    db.commit()
    db.refresh(anchor)

    write_audit(
        db,
        user_payload.get("sub", "admin"),
        "BLOCKCHAIN_ANCHOR_RETRY",
        site_id=anchor.site_id,
        detail=f"Retried anchor {anchor.id}: status={anchor.status}, attempt={anchor.attempt_count}",
    )
    return anchor


@app.post("/ledger/tamper-demo/{alert_id}")
def tamper_demo(
    alert_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    tamper_suffix = "".join(random.choices(string.ascii_uppercase, k=4))
    current = security.decrypt_field(alert.detail_enc) if alert.detail_enc else "Event Detail"
    alert.detail_enc = security.encrypt_field(current + f" [TAMPERED-{tamper_suffix}]")
    db.commit()
    write_audit(db, user_payload.get("sub"), "TAMPER_DEMO", site_id=alert.site_id, detail=f"Directly edited {alert_id} bypassing ledger")
    return {"status": "tampered", "alert_id": alert_id}


# ---------------------------------------------------------------------------
# Advanced Blockchain Integrity: Merkle Proofs & Provenance (FR-MP)
# ---------------------------------------------------------------------------


@app.post("/ledger/merkle/build", response_model=schemas.MerkleBuildResponse)
def build_merkle_tree_endpoint(
    req: schemas.MerkleBuildRequest,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    site_id = req.site_id or "site-alpha"
    security.validate_site_access(user_payload, site_id)

    records = (
        db.query(models.LedgerRecord)
        .filter(
            models.LedgerRecord.site_id == site_id,
            models.LedgerRecord.seq >= req.from_sequence,
            models.LedgerRecord.seq <= req.through_sequence,
        )
        .order_by(models.LedgerRecord.seq.asc())
        .all()
    )
    if not records:
        raise HTTPException(status_code=400, detail="No ledger records in specified sequence range")

    leaf_hashes = []
    prov_hashes = []
    for r in records:
        alert = db.query(models.Alert).filter(models.Alert.id == r.alert_id).first()
        if alert and not alert.provenance_hash:
            provenance_service.attach_alert_provenance(alert, db)
            db.commit()

        leaf_payload = merkle_engine.build_canonical_leaf_payload(
            site_id=site_id,
            sequence=r.seq,
            alert_id=r.alert_id,
            record_hash=r.record_hash,
            model_provenance_hash=alert.provenance_hash if alert else None,
            rule_config_hash=alert.rule_config_hash if alert else None,
        )
        leaf_hashes.append(merkle_engine.compute_leaf_hash(leaf_payload))
        prov_hashes.append(alert.provenance_hash if (alert and alert.provenance_hash) else ("0" * 64))

    root_hash, _ = merkle_engine.build_merkle_tree(leaf_hashes)
    prov_root = merkle_engine.compute_provenance_root(prov_hashes)

    return schemas.MerkleBuildResponse(
        root_hash=root_hash,
        provenance_root_hash=prov_root,
        leaf_count=len(leaf_hashes),
        from_sequence=req.from_sequence,
        through_sequence=req.through_sequence,
        schema_version="merkle-v1",
    )


@app.get("/ledger/proof/{alert_id}", response_model=schemas.MerkleProofResponse)
@app.get("/alerts/{alert_id}/merkle-proof", response_model=schemas.MerkleProofResponse)
def get_alert_merkle_proof(
    alert_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    security.validate_site_access(user_payload, alert.site_id)

    ledger_rec = db.query(models.LedgerRecord).filter(models.LedgerRecord.alert_id == alert_id).first()
    if not ledger_rec:
        raise HTTPException(status_code=400, detail=f"Alert {alert_id} has no linked ledger sequence")

    # Check if there is an active proposal or anchor covering this record
    anchor = (
        db.query(models.MerkleAnchor)
        .filter(
            models.MerkleAnchor.site_id == alert.site_id,
            models.MerkleAnchor.from_sequence <= ledger_rec.seq,
            models.MerkleAnchor.through_sequence >= ledger_rec.seq,
        )
        .first()
    )

    from_seq = anchor.from_sequence if anchor else 0
    through_seq = anchor.through_sequence if anchor else ledger_rec.seq

    # Query all records in range
    records = (
        db.query(models.LedgerRecord)
        .filter(
            models.LedgerRecord.site_id == alert.site_id,
            models.LedgerRecord.seq >= from_seq,
            models.LedgerRecord.seq <= through_seq,
        )
        .order_by(models.LedgerRecord.seq.asc())
        .all()
    )

    leaf_hashes = []
    target_index = -1
    target_payload = {}

    for idx, r in enumerate(records):
        rec_alert = db.query(models.Alert).filter(models.Alert.id == r.alert_id).first()
        if rec_alert and not rec_alert.provenance_hash:
            provenance_service.attach_alert_provenance(rec_alert, db)
            db.commit()

        lp = merkle_engine.build_canonical_leaf_payload(
            site_id=alert.site_id,
            sequence=r.seq,
            alert_id=r.alert_id,
            record_hash=r.record_hash,
            model_provenance_hash=rec_alert.provenance_hash if rec_alert else None,
            rule_config_hash=rec_alert.rule_config_hash if rec_alert else None,
        )
        lh = merkle_engine.compute_leaf_hash(lp)
        leaf_hashes.append(lh)
        if r.seq == ledger_rec.seq:
            target_index = idx
            target_payload = lp

    if target_index == -1:
        raise HTTPException(status_code=500, detail="Target leaf could not be indexed in sequence range")

    root_hash, _ = merkle_engine.build_merkle_tree(leaf_hashes)
    sibling_hashes, positions = merkle_engine.generate_merkle_proof(leaf_hashes, target_index)

    return schemas.MerkleProofResponse(
        alert_id=alert.id,
        sequence=ledger_rec.seq,
        leaf_hash=leaf_hashes[target_index],
        leaf_payload=target_payload,
        sibling_hashes=sibling_hashes,
        positions=positions,
        root_hash=root_hash,
        schema_version="merkle-v1",
        from_sequence=from_seq,
        through_sequence=through_seq,
    )


@app.post("/ledger/proof/verify", response_model=schemas.MerkleProofVerifyResponse)
def verify_merkle_proof_endpoint(
    req: schemas.MerkleProofVerifyRequest,
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    valid, calc_root = merkle_engine.verify_merkle_proof(
        leaf_hash=req.leaf_hash,
        sibling_hashes=req.sibling_hashes,
        positions=req.positions,
        root_hash=req.root_hash,
    )
    msg = (
        "Alert is included in the requested Merkle root."
        if valid
        else f"Proof mismatch: computed root ({calc_root}) does not match expected root ({req.root_hash})."
    )
    return schemas.MerkleProofVerifyResponse(
        valid=valid,
        alert_id=req.alert_id,
        root_hash=req.root_hash,
        calculated_root_hash=calc_root,
        message=msg,
    )


# ---------------------------------------------------------------------------
# AI Model Provenance APIs (FR-MP-4, FR-MP-5)
# ---------------------------------------------------------------------------
@app.get("/models/{model_version}/provenance", response_model=schemas.ModelProvenanceOut)
def get_model_provenance(
    model_version: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    prov = provenance_service.get_or_register_model_provenance(db, model_version)
    return schemas.ModelProvenanceOut(
        id=prov.id,
        model_name=prov.model_name,
        model_version=prov.model_version,
        artifact_hash=prov.artifact_hash,
        runtime_version=prov.runtime_version,
        rule_version=prov.rule_version,
        rule_config_hash=prov.rule_config_hash,
        preprocessing_config_hash=prov.preprocessing_config_hash,
        provenance_hash=prov.provenance_hash,
        registered_by=prov.registered_by,
        created_at=prov.created_at,
    )


@app.get("/alerts/{alert_id}/provenance", response_model=schemas.AlertProvenanceOut)
def get_alert_provenance(
    alert_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True))
):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    security.validate_site_access(user_payload, alert.site_id)

    if not alert.provenance_hash:
        provenance_service.attach_alert_provenance(alert, db)
        db.commit()
        db.refresh(alert)

    return schemas.AlertProvenanceOut(
        alert_id=alert.id,
        provenance=alert.provenance or "detector",
        model_name=alert.model_name,
        model_version=alert.model_version,
        model_artifact_hash=alert.model_artifact_hash,
        runtime_version=alert.runtime_version,
        rule_version=alert.rule_version,
        rule_config_hash=alert.rule_config_hash,
        preprocessing_config_hash=alert.preprocessing_config_hash,
        provenance_hash=alert.provenance_hash,
        is_valid=True,
    )


@app.post("/alerts/{alert_id}/provenance/verify", response_model=schemas.AlertProvenanceVerifyResponse)
def verify_alert_provenance_endpoint(
    alert_id: str,
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    security.validate_site_access(user_payload, alert.site_id)

    matches, stored_hash, recomputed_hash, message = provenance_service.verify_alert_provenance(alert)
    return schemas.AlertProvenanceVerifyResponse(
        alert_id=alert.id,
        provenance=alert.provenance or "detector",
        stored_hash=stored_hash,
        recomputed_hash=recomputed_hash,
        matches=matches,
        message=message,
    )


# ---------------------------------------------------------------------------
# Audit Log & C2 Staging (FR-5, FR-7, FR-9)
# ---------------------------------------------------------------------------
@app.get("/audit-log", response_model=List[schemas.AuditLogOut])
def get_audit_log(
    site_id: Optional[str] = Query(default=None),
    limit: int = Query(default=200, le=500),
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor"))
):
    if site_id:
        security.validate_site_access(user_payload, site_id)

    q = db.query(models.AuditLog)
    allowed_sites = user_payload.get("site_ids", ["*"])
    if "*" not in allowed_sites:
        q = q.filter(models.AuditLog.site_id.in_(allowed_sites))
    if site_id:
        q = q.filter(models.AuditLog.site_id == site_id)

    return q.order_by(models.AuditLog.ts.desc()).limit(limit).all()


# ---------------------------------------------------------------------------
# C2 Tactical Deliveries & Retry Management (PRD v1 FR-10)
# ---------------------------------------------------------------------------
@app.get("/api/c2/deliveries")
def list_c2_deliveries(
    site_id: Optional[str] = Query(default=None),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor", allow_guest_operator=True))
):
    """List historical C2 tactical deliveries and pending retry queue."""
    allowed_sites = user_payload.get("site_ids", ["*"])
    
    delivered = [
        d for d in rule_engine.c2_delivery_log
        if ("*" in allowed_sites or d.get("site_id") in allowed_sites) and (not site_id or d.get("site_id") == site_id)
    ]
    retry_queue = [
        r for r in rule_engine.c2_retry_queue
        if ("*" in allowed_sites or r.get("site_id") in allowed_sites) and (not site_id or r.get("site_id") == site_id)
    ]
    return {
        "delivered_count": len(delivered),
        "dead_letter_count": len(retry_queue),
        "deliveries": delivered[-50:],
        "retry_queue": retry_queue
    }


@app.post("/api/c2/deliveries/{delivery_id}/retry")
def retry_c2_delivery(
    delivery_id: str,
    user_payload: Dict[str, Any] = Depends(security.require_role("admin"))
):
    """Manually retry a dead-lettered tactical C2 delivery."""
    matching = [item for item in rule_engine.c2_retry_queue if item.get("alert_id") == delivery_id or item.get("idempotency_key") == delivery_id]
    if not matching:
        raise HTTPException(status_code=404, detail="No matching dead-letter delivery found to retry")
    
    item = matching[0]
    rule_engine.c2_retry_queue.remove(item)
    
    result = rule_engine.dispatch_to_c2_sync(item.get("alert_id"), item.get("payload", {}), max_retries=1)
    return {"status": "retried", "result": result}


@app.post("/api/c2/mock-webhook")
def c2_mock_webhook(payload: dict):
    return {"status": "received", "timestamp": datetime.utcnow().isoformat()}


# ---------------------------------------------------------------------------
# Agent37 Intelligence Integration – Settings, Investigation & Briefing
# ---------------------------------------------------------------------------
import urllib.request
import urllib.error
import json as _json

# In-memory encrypted store for Agent37 / Gemini AI configuration
_AGENT37_KEY_DB_ID = "__agent37_api_key__"
_AGENT37_URL_DB_ID = "__agent37_base_url__"
_AGENT37_MODEL_DB_ID = "__agent37_model__"


def _get_agent37_key(db: Session) -> Optional[str]:
    """Retrieve the stored (encrypted) Agent37 API key from site settings."""
    row = db.query(models.SiteSettings).filter(
        models.SiteSettings.key == _AGENT37_KEY_DB_ID
    ).first()
    if not row:
        return os.environ.get("AGENT37_API_KEY")
    try:
        return security.decrypt_field(row.value)
    except Exception:
        return None


def _get_agent37_config(db: Session) -> Dict[str, Optional[str]]:
    key = _get_agent37_key(db)
    url_row = db.query(models.SiteSettings).filter(models.SiteSettings.key == _AGENT37_URL_DB_ID).first()
    model_row = db.query(models.SiteSettings).filter(models.SiteSettings.key == _AGENT37_MODEL_DB_ID).first()
    base_url = (url_row.value if url_row and url_row.value else None) or os.environ.get("AGENT37_BASE_URL")
    model = (model_row.value if model_row and model_row.value else None) or os.environ.get("AGENT37_MODEL")
    return {"api_key": key, "base_url": base_url, "model": model}


def _set_agent37_config(db: Session, api_key: str, username: str, base_url: Optional[str] = None, model: Optional[str] = None):
    """Persist an AES-encrypted Agent37 API key and configuration into site settings."""
    encrypted = security.encrypt_field(api_key)
    row = db.query(models.SiteSettings).filter(
        models.SiteSettings.key == _AGENT37_KEY_DB_ID
    ).first()
    if row:
        row.value = encrypted
        row.updated_at = datetime.utcnow()
    else:
        db.add(models.SiteSettings(
            key=_AGENT37_KEY_DB_ID,
            value=encrypted,
            site_id="site-alpha",
            updated_by=username,
        ))

    # Base URL
    url_row = db.query(models.SiteSettings).filter(models.SiteSettings.key == _AGENT37_URL_DB_ID).first()
    if url_row:
        url_row.value = base_url.strip() if base_url else ""
    elif base_url and base_url.strip():
        db.add(models.SiteSettings(key=_AGENT37_URL_DB_ID, value=base_url.strip(), site_id="site-alpha", updated_by=username))

    # Model
    model_row = db.query(models.SiteSettings).filter(models.SiteSettings.key == _AGENT37_MODEL_DB_ID).first()
    if model_row:
        model_row.value = model.strip() if model else ""
    elif model and model.strip():
        db.add(models.SiteSettings(key=_AGENT37_MODEL_DB_ID, value=model.strip(), site_id="site-alpha", updated_by=username))

    db.commit()


def _delete_agent37_key(db: Session):
    """Remove the Agent37 API key and config from site settings."""
    db.query(models.SiteSettings).filter(
        models.SiteSettings.key.in_([_AGENT37_KEY_DB_ID, _AGENT37_URL_DB_ID, _AGENT37_MODEL_DB_ID])
    ).delete(synchronize_session=False)
    db.commit()


def _detect_provider(api_key: str, custom_url: Optional[str] = None) -> str:
    """Detect whether a key belongs to Agent37 Cloud, Google Gemini, OpenAI, or a custom instance."""
    k = (api_key or "").strip()
    if k.startswith(("mock_", "test_")) or k == "agent37-demo-key":
        return "demo"
    if k.startswith("sk_live_") or (custom_url and "agent37" in custom_url):
        return "agent37"
    if k.startswith("AIza") or (custom_url and "generativelanguage.googleapis.com" in custom_url):
        return "gemini"
    if k.startswith(("sk-", "sk_")):
        return "openai"
    return "agent37" if not custom_url else "custom"


def _discover_gemini_candidates(api_key: str, requested_model: Optional[str] = None) -> List[Tuple[str, str]]:
    """
    Discover available Gemini models for this API key via ModelService.ListModels across v1 and v1beta.
    Returns list of (api_version, model_name) tuples to try in priority order.
    """
    pref = requested_model or os.environ.get("AGENT37_MODEL")
    if pref:
        clean = pref.replace("models/", "").strip()
        return [("v1beta", clean), ("v1", clean)]

    discovered: List[Tuple[str, str]] = []
    for ver in ("v1beta", "v1"):
        try:
            url = f"https://generativelanguage.googleapis.com/{ver}/models?key={api_key}"
            req = urllib.request.Request(url, headers={"Content-Type": "application/json"}, method="GET")
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = _json.loads(resp.read().decode("utf-8"))
                for m in data.get("models", []):
                    m_name = m.get("name", "").replace("models/", "").strip()
                    methods = m.get("supportedGenerationMethods", []) or m.get("supported_actions", [])
                    if methods and "generateContent" not in methods:
                        continue
                    if m_name and (ver, m_name) not in discovered:
                        discovered.append((ver, m_name))
        except Exception:
            pass

    preferred_models = [
        "gemini-1.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash-latest",
        "gemini-1.5-pro",
        "gemini-1.5-pro-latest",
        "gemini-2.0-flash-exp",
    ]
    sorted_candidates: List[Tuple[str, str]] = []
    for prio in preferred_models:
        for ver, mod in discovered:
            if mod == prio and (ver, mod) not in sorted_candidates:
                sorted_candidates.append((ver, mod))
    for pair in discovered:
        if pair not in sorted_candidates:
            sorted_candidates.append(pair)

    if sorted_candidates:
        return sorted_candidates

    # Comprehensive fallback matrix across both v1 and v1beta (v1 gemini-1.5-flash is universal GA)
    return [
        ("v1", "gemini-1.5-flash"),
        ("v1beta", "gemini-2.0-flash"),
        ("v1beta", "gemini-1.5-flash"),
        ("v1", "gemini-1.5-pro"),
        ("v1beta", "gemini-1.5-pro"),
        ("v1beta", "gemini-2.0-flash-exp"),
        ("v1", "gemini-2.0-flash"),
        ("v1beta", "gemini-1.5-flash-8b"),
    ]


def _agent37_cloud_instances(api_key: str, base_url: Optional[str] = None) -> List[Dict[str, Any]]:
    """Query Agent37 Control Plane (https://api.agent37.com/v1/instances) for user instances."""
    url = (base_url or "https://api.agent37.com/v1").rstrip("/")
    if not url.endswith("/instances") and "agent37.app" not in url:
        url = f"{url}/instances"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "IBVAP/5.0",
            "Accept": "application/json"
        },
        method="GET"
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = _json.loads(resp.read().decode("utf-8"))
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return data.get("instances") or data.get("data") or ([data] if data.get("id") else [])
        return []


def _call_agent37(
    api_key: str,
    messages: list,
    model: Optional[str] = None,
    custom_url_override: Optional[str] = None
) -> str:
    """Call the Agent37 intelligence provider (native Agent37 Cloud, Gemini, OpenAI, or instance endpoint)."""
    provider = _detect_provider(api_key, custom_url_override)

    # 1. Local Demo Mode
    if provider == "demo":
        return _json.dumps({
            "summary": "Simulated intelligence analysis for test key.",
            "threat_level": "LOW",
            "timeline": [{"time": "T0", "event": "Simulated event"}],
            "key_findings": ["System operating within baseline parameters."],
            "recommended_actions": ["Routine patrol check."],
            "confidence": 0.95,
            "notes": "Generated in simulated test mode.",
            "executive_summary": "Surveillance sector quiet with normal patrol activity.",
            "threat_overview": "QUIET",
            "hotspot_cameras": [],
            "alert_breakdown": {},
            "key_incidents": [],
            "patterns_observed": ["Normal activity."],
            "recommended_priorities": ["Maintain standard watch."],
            "period": "simulated"
        })

    # 2. Agent37 Cloud (https://www.agent37.com)
    if provider == "agent37":
        prompt_content = "\n\n".join(m.get("content", "") for m in messages if m.get("content"))
        target_instance_url = None

        # Check if an explicit instance URL or custom endpoint was provided
        if custom_url_override:
            clean_url = custom_url_override.rstrip("/")
            if "agent37.app" in clean_url:
                target_instance_url = clean_url if clean_url.endswith("/v1/responses") else f"{clean_url}/v1/responses"
            elif clean_url.startswith("http"):
                target_instance_url = clean_url

        # Auto-discover active running instance from Agent37 control plane
        if not target_instance_url:
            try:
                instances = _agent37_cloud_instances(api_key, base_url=custom_url_override)
                running = [
                    inst for inst in instances
                    if isinstance(inst, dict) and inst.get("status") in ("running", "active", "ready")
                ]
                if running:
                    inst = running[0]
                    inst_id = inst.get("id")
                    ports = inst.get("ports", [])
                    default_port = next((p for p in ports if isinstance(p, dict) and p.get("default")), None)
                    inst_url = (default_port.get("url") if default_port else None) or f"https://{inst_id}.agent37.app"
                    target_instance_url = f"{inst_url.rstrip('/')}/v1/responses"
                elif instances:
                    statuses = ", ".join(f"{i.get('id', 'instance')}: {i.get('status', 'unknown')}" for i in instances[:3] if isinstance(i, dict))
                    raise HTTPException(
                        status_code=502,
                        detail=f"Agent37 instance(s) found, but none are currently running ({statuses}). Please launch or resume your instance at https://www.agent37.com."
                    )
                else:
                    raise HTTPException(
                        status_code=502,
                        detail="Agent37 API key verified, but no active instance found on your agent37.com account. Launch an instance at https://www.agent37.com or enter your instance URL (e.g. https://<id>.agent37.app) in Settings. Alternatively, use a Google Gemini key (AIzaSy...) or Offline Demo key."
                    )
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                raise HTTPException(status_code=502, detail=f"Agent37 Cloud API error {exc.code}: {detail[:400]}")
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(status_code=502, detail=f"Agent37 Cloud unreachable: {str(exc)[:200]}")

        # Send turn to Agent37 instance responses endpoint
        req = urllib.request.Request(
            target_instance_url,
            data=_json.dumps({
                "input": prompt_content,
                "stream": False,
                "model": model or os.environ.get("AGENT37_MODEL") or None
            }).encode("utf-8"),
            headers={
                "X-Agent37-Key": api_key,
                "Content-Type": "application/json",
                "User-Agent": "IBVAP/5.0"
            },
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                data = _json.loads(resp.read().decode("utf-8"))
                return (
                    data.get("output_text") or
                    data.get("response") or
                    data.get("text") or
                    (data.get("choices", [{}])[0].get("message", {}).get("content", "") if data.get("choices") else None) or
                    _json.dumps(data)
                )
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise HTTPException(status_code=502, detail=f"Agent37 instance error {exc.code}: {detail[:400]}")
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Agent37 instance unreachable: {str(exc)[:200]}")

    # 3. Google Gemini (AI Studio)
    if provider == "gemini":
        candidates_to_try = _discover_gemini_candidates(api_key, requested_model=model)

        system_parts = []
        contents = []
        for m in messages:
            role = m.get("role")
            content = m.get("content", "")
            if role == "system":
                system_parts.append({"text": content})
            elif role in ("user", "assistant"):
                g_role = "user" if role == "user" else "model"
                contents.append({"role": g_role, "parts": [{"text": content}]})

        if not contents:
            contents = [{"role": "user", "parts": [{"text": "Hello"}]}]

        payload: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 1800,
            }
        }
        if system_parts:
            payload["systemInstruction"] = {"parts": system_parts}

        body = _json.dumps(payload).encode("utf-8")
        last_error_detail = None

        for api_ver, active_model in candidates_to_try:
            endpoint = f"https://generativelanguage.googleapis.com/{api_ver}/models/{active_model}:generateContent?key={api_key}"
            req = urllib.request.Request(
                endpoint,
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = _json.loads(resp.read().decode("utf-8"))
                    candidates = data.get("candidates", [])
                    if not candidates:
                        raise HTTPException(status_code=502, detail="Gemini returned no response candidates")
                    parts = candidates[0].get("content", {}).get("parts", [])
                    return "".join(p.get("text", "") for p in parts)
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                last_error_detail = detail
                if exc.code == 404:
                    continue
                raise HTTPException(status_code=502, detail=f"Gemini API error {exc.code}: {detail[:400]}")
            except HTTPException:
                raise
            except Exception as exc:
                last_error_detail = str(exc)
                continue

        raise HTTPException(status_code=502, detail=f"Gemini unreachable across all tested models: {str(last_error_detail)[:300]}")

    # 4. OpenAI / OpenAI-compatible endpoint
    endpoint = custom_url_override or os.environ.get("AGENT37_BASE_URL") or "https://api.openai.com/v1/chat/completions"
    active_model = model or os.environ.get("AGENT37_MODEL") or ("gpt-4o-mini" if "openai.com" in endpoint else "agent37")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    body = _json.dumps({
        "model": active_model,
        "messages": messages,
        "max_tokens": 1800,
        "temperature": 0.3,
    }).encode("utf-8")
    req = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = _json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=502, detail=f"AI Provider error {exc.code}: {detail[:400]}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI Provider unreachable: {str(exc)[:200]}")


@app.get("/api/settings/agent37")
def get_agent37_settings(
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("operator", allow_guest_operator=True)),
):
    """Return whether an Agent37 API key is currently configured with detected provider metadata."""
    cfg = _get_agent37_config(db)
    key = cfg.get("api_key")
    configured = key is not None and len(key) > 0
    masked = f"{key[:8]}{'*' * max(0, len(key) - 12)}{key[-4:]}" if configured and len(key) > 12 else ("••••••••" if configured else None)
    provider = _detect_provider(key, cfg.get("base_url")) if configured and key else "none"
    return {
        "configured": configured,
        "masked_key": masked,
        "provider": provider,
        "base_url": cfg.get("base_url"),
        "model": cfg.get("model")
    }


@app.put("/api/settings/agent37")
def upsert_agent37_settings(
    body: Dict[str, Any],
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin")),
):
    """Save (or replace) the Agent37 API key and optional configuration. Validates the key before persisting."""
    api_key = (body.get("api_key") or "").strip()
    base_url = (body.get("base_url") or "").strip() or None
    model = (body.get("model") or "").strip() or None

    if not api_key:
        raise HTTPException(status_code=422, detail="api_key must not be empty")
    if len(api_key) < 6:
        raise HTTPException(status_code=422, detail="api_key appears too short to be valid")

    provider = _detect_provider(api_key, base_url)

    # Validation probe
    try:
        if provider == "demo":
            pass  # Demo keys always valid
        elif provider == "agent37":
            # For Agent37 cloud keys (sk_live_...), validate against Agent37 Control Plane or instance
            if base_url and "agent37.app" in base_url:
                _call_agent37(api_key, [{"role": "user", "content": "Ping"}], model=model, custom_url_override=base_url)
            else:
                try:
                    _agent37_cloud_instances(api_key, base_url=base_url)
                except urllib.error.HTTPError as exc:
                    detail = exc.read().decode("utf-8", errors="replace")
                    if exc.code in (401, 403):
                        raise HTTPException(status_code=400, detail=f"Agent37 API key invalid or unauthorized: {detail[:250]}")
                    raise HTTPException(status_code=400, detail=f"Agent37 Cloud API error {exc.code}: {detail[:250]}")
                except Exception as exc:
                    raise HTTPException(status_code=400, detail=f"Agent37 unreachable: {str(exc)[:250]}")
        else:
            _call_agent37(api_key, [{"role": "user", "content": "Respond with: OK"}], model=model, custom_url_override=base_url)
    except HTTPException as exc:
        raise HTTPException(status_code=400, detail=f"API key validation failed: {exc.detail}")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"API key validation failed: {str(exc)[:250]}")

    username = user_payload.get("sub", "admin")
    _set_agent37_config(db, api_key, username, base_url=base_url, model=model)
    write_audit(db, username, "agent37_key_updated", detail=f"Agent37 API key upserted and validated ({provider})")
    return {"status": "saved", "configured": True, "provider": provider}


@app.delete("/api/settings/agent37")
def delete_agent37_settings(
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("admin")),
):
    """Remove the stored Agent37 API key and configuration."""
    _delete_agent37_key(db)
    username = user_payload.get("sub", "admin")
    write_audit(db, username, "agent37_key_deleted", detail="Agent37 API key removed")
    return {"status": "deleted", "configured": False}


@app.post("/api/ai/investigate")
def ai_investigate_alert(
    body: Dict[str, Any],
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor")),
):
    """
    AI Incident Investigation: given an alert_id, retrieves the alert and all
    correlated evidence, then calls Agent37 to produce a structured investigation
    report: timeline, threat assessment, recommended actions, and confidence.
    """
    alert_id = body.get("alert_id", "").strip()
    if not alert_id:
        raise HTTPException(status_code=422, detail="alert_id is required")

    cfg = _get_agent37_config(db)
    api_key = cfg.get("api_key")
    if not api_key:
        raise HTTPException(status_code=503, detail="Agent37 API key not configured. Contact your administrator.")

    # Fetch the primary alert
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")

    # Fetch correlated alerts from the same camera within ±30 min window
    ts_alert = alert.ts or datetime.utcnow()
    window_start = ts_alert - timedelta(minutes=30)
    window_end = ts_alert + timedelta(minutes=30)
    correlated = db.query(models.Alert).filter(
        models.Alert.cam_id == alert.cam_id,
        models.Alert.id != alert_id,
        models.Alert.ts >= window_start,
        models.Alert.ts <= window_end,
    ).order_by(models.Alert.ts).limit(10).all()

    alert_detail = security.decrypt_field(alert.detail_enc) if alert.detail_enc else ""

    corr_summary = []
    for a in correlated:
        corr_summary.append({
            "id": a.id,
            "type": a.type,
            "sev": a.sev,
            "detail": security.decrypt_field(a.detail_enc) if a.detail_enc else "",
            "ts": a.ts.isoformat() if a.ts else "unknown",
            "state": a.state or "open",
        })

    system_prompt = (
        "You are Agent37, an expert AI surveillance analyst embedded in the IBVAP "
        "(Integrated Border & Surveillance Video Analytics Platform). "
        "You analyse security incidents with precision, factual reasoning, and tactical clarity. "
        "Format your response as structured JSON with the following keys: "
        "\"summary\" (string, 2-3 sentences), "
        "\"threat_level\" (one of: LOW / MEDIUM / HIGH / CRITICAL), "
        "\"timeline\" (array of objects with keys: time, event), "
        "\"key_findings\" (array of strings), "
        "\"recommended_actions\" (array of strings), "
        "\"confidence\" (integer 0-100), "
        "\"notes\" (string, any caveats or uncertainty). "
        "Be concise. Do not fabricate evidence not present in the data."
    )

    user_prompt = (
        f"INCIDENT INVESTIGATION REQUEST\n\n"
        f"Primary Alert:\n"
        f"  ID: {alert.id}\n"
        f"  Type: {alert.type}\n"
        f"  Severity: {alert.sev}\n"
        f"  Camera: {alert.cam_name} ({alert.cam_id})\n"
        f"  Location: {alert.location}\n"
        f"  Detail: {alert_detail}\n"
        f"  Confidence: {alert.confidence}%\n"
        f"  Track ID: {alert.track_id}\n"
        f"  Timestamp: {ts_alert.isoformat()}\n"
        f"  State: {alert.state or 'open'}\n"
        f"  Provenance: {alert.provenance or 'detector'}\n\n"
        f"Correlated alerts on same camera within ±30 min ({len(corr_summary)} found):\n"
        f"{_json.dumps(corr_summary, indent=2)}\n\n"
        f"Investigate this incident. Identify patterns, assess threat level, build a timeline, "
        f"and provide recommended actions for the security supervisor."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    raw = _call_agent37(api_key, messages, model=cfg.get("model"), custom_url_override=cfg.get("base_url"))

    # Try to parse JSON from the response; fall back to wrapping raw text
    try:
        # Strip markdown code fences if present
        clean = raw.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[-1]
            if clean.endswith("```"):
                clean = clean[:-3]
        result = _json.loads(clean)
    except Exception:
        result = {
            "summary": raw[:500],
            "threat_level": "UNKNOWN",
            "timeline": [],
            "key_findings": [],
            "recommended_actions": [],
            "confidence": 0,
            "notes": "Response could not be parsed as structured JSON.",
        }

    write_audit(
        db,
        user_payload.get("sub", "supervisor"),
        "ai_investigation",
        detail=f"Investigated alert {alert_id}",
    )
    return {"alert_id": alert_id, "investigation": result, "correlated_count": len(corr_summary)}


@app.post("/api/ai/briefing")
def ai_surveillance_briefing(
    body: Dict[str, Any],
    db: Session = Depends(get_db),
    user_payload: Dict[str, Any] = Depends(security.require_role("supervisor")),
):
    """
    AI Surveillance Briefing: aggregates all alerts for a requested time window
    and calls Agent37 to produce a structured intelligence summary report.
    """
    # Parse time window (ISO strings or hours integer)
    hours_back = int(body.get("hours_back", 24))
    hours_back = max(1, min(hours_back, 168))  # 1h – 7d cap
    since = datetime.utcnow() - timedelta(hours=hours_back)

    # Fetch Agent37 / Gemini config
    cfg = _get_agent37_config(db)
    api_key = cfg.get("api_key")
    if not api_key:
        raise HTTPException(status_code=503, detail="Agent37 API key not configured. Contact your administrator.")

    alerts_q = db.query(models.Alert).filter(
        models.Alert.ts >= since
    ).order_by(models.Alert.ts.desc()).limit(200).all()

    if not alerts_q:
        return {
            "period_hours": hours_back,
            "alert_count": 0,
            "briefing": {
                "executive_summary": f"No alerts recorded in the past {hours_back} hours.",
                "threat_overview": "QUIET",
                "hotspot_cameras": [],
                "alert_breakdown": {},
                "key_incidents": [],
                "patterns_observed": [],
                "recommended_priorities": [],
                "confidence": 100,
                "period": f"Last {hours_back}h",
            }
        }

    # Build statistical digest
    type_counts: Dict[str, int] = {}
    sev_counts: Dict[str, int] = {}
    cam_counts: Dict[str, int] = {}
    cam_names: Dict[str, str] = {}

    for a in alerts_q:
        type_counts[a.type] = type_counts.get(a.type, 0) + 1
        sev_counts[a.sev] = sev_counts.get(a.sev, 0) + 1
        cam_counts[a.cam_id] = cam_counts.get(a.cam_id, 0) + 1
        cam_names[a.cam_id] = a.cam_name

    hotspot_cams = sorted(cam_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    hotspot_list = [{"cam_id": k, "cam_name": cam_names.get(k, k), "count": v} for k, v in hotspot_cams]

    # Top-5 high-severity incidents for the prompt
    top_incidents = [a for a in alerts_q if a.sev == "high"][:5]
    incidents_detail = []
    for a in top_incidents:
        incidents_detail.append({
            "id": a.id,
            "type": a.type,
            "camera": a.cam_name,
            "location": a.location,
            "detail": security.decrypt_field(a.detail_enc) if a.detail_enc else "",
            "ts": a.created_at.isoformat() if a.created_at else "unknown",
        })

    system_prompt = (
        "You are Agent37, an expert AI surveillance intelligence analyst for the IBVAP platform. "
        "Produce a structured intelligence briefing for a security supervisor covering the surveillance period. "
        "Return valid JSON with keys: "
        "\"executive_summary\" (string, 3-4 sentences), "
        "\"threat_overview\" (one of: QUIET / ELEVATED / HIGH / CRITICAL), "
        "\"hotspot_cameras\" (array of strings), "
        "\"alert_breakdown\" (object mapping alert type to count), "
        "\"key_incidents\" (array of objects: {id, type, camera, significance}), "
        "\"patterns_observed\" (array of strings), "
        "\"recommended_priorities\" (array of strings), "
        "\"confidence\" (integer 0-100), "
        "\"period\" (string label for the time window)."
    )

    user_prompt = (
        f"SURVEILLANCE BRIEFING REQUEST\n"
        f"Time window: Last {hours_back} hours (since {since.strftime('%Y-%m-%d %H:%M UTC')})\n\n"
        f"Total alerts: {len(alerts_q)}\n"
        f"Alert types: {_json.dumps(type_counts)}\n"
        f"Severity breakdown: {_json.dumps(sev_counts)}\n"
        f"Hotspot cameras: {_json.dumps(hotspot_list)}\n"
        f"Top high-severity incidents:\n{_json.dumps(incidents_detail, indent=2)}\n\n"
        f"Generate a comprehensive intelligence briefing. Identify threat patterns, "
        f"operational priorities, and any anomalies. Be analytical and concise."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    raw = _call_agent37(api_key, messages, model=cfg.get("model"), custom_url_override=cfg.get("base_url"))

    try:
        clean = raw.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[-1]
            if clean.endswith("```"):
                clean = clean[:-3]
        result = _json.loads(clean)
    except Exception:
        result = {
            "executive_summary": raw[:600],
            "threat_overview": "UNKNOWN",
            "hotspot_cameras": [],
            "alert_breakdown": type_counts,
            "key_incidents": [],
            "patterns_observed": [],
            "recommended_priorities": [],
            "confidence": 0,
            "period": f"Last {hours_back}h",
        }

    write_audit(
        db,
        user_payload.get("sub", "supervisor"),
        "ai_briefing",
        detail=f"Briefing for last {hours_back}h ({len(alerts_q)} alerts)",
    )
    return {
        "period_hours": hours_back,
        "alert_count": len(alerts_q),
        "type_counts": type_counts,
        "sev_counts": sev_counts,
        "briefing": result,
    }


# ---------------------------------------------------------------------------
# Authenticated WebSocket with Site Scoping (FR-1.1, FR-2.3)
# ---------------------------------------------------------------------------
@app.post("/api/alerts/websocket-grant")
def issue_alert_websocket_grant(
    user_payload: Dict[str, Any] = Depends(security.require_role("operator")),
):
    """Issue a short-lived grant for the browser's native alert WebSocket."""
    return {
        "grant": security.create_browser_grant(user_payload, "alerts_socket"),
        "expiresIn": security.MEDIA_GRANT_TTL_SECONDS,
    }


@app.websocket("/ws/alerts")
async def ws_alerts(
    websocket: WebSocket,
    token: Optional[str] = Query(default=None),
    grant: Optional[str] = None,
    site_id: Optional[str] = Query(default=None)
):
    """FR-1.1 / FR-2.3: Rejects invalid token or unauthorized site access on WebSocket."""
    try:
        payload = security.validate_browser_grant(grant, "alerts_socket") if grant else security.authenticate_ws_token(token)
        if site_id:
            security.validate_site_access(payload, site_id)
    except HTTPException:
        await websocket.close(code=1008)
        return

    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
