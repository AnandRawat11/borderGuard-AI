"""
Rule Engine and C2 Tactical Integration Adapter for IBVAP (PRD v4 FR-4, FR-5, FR-8).
Evaluates virtual fence lines and polygon zones with cooldown deduplication,
creates EvidenceAsset records, and dispatches real signed HTTP payloads to C2 network.
"""
import os
import time
import random
import math
import base64
import logging
import hashlib
import hmac
import secrets
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone
import asyncio
from collections import OrderedDict
from threading import RLock
from typing import List, Dict, Tuple, Optional, Any
from sqlalchemy.orm import Session

from . import models, schemas, security, ledger, feature_flags
from .database import SessionLocal
from .ws_manager import manager
from .tracker import Track

try:
    from .analytics_config import (
        ALERT_COOLDOWN_SECONDS,
        EVENT_DEDUP_SPATIAL_BUCKET_SIZE,
        EVENT_DEDUP_TIME_BUCKET_SECONDS,
        EVENT_DEDUP_MAX_ENTRIES,
        WEAPON_VERIFICATION_WINDOW_SECONDS,
        WEAPON_MIN_DETECTIONS,
        WEAPON_MIN_CONFIDENCE,
        WEAPON_POTENTIAL_THRESHOLD,
    )
    from .weapon_verifier import get_weapon_verifier, WeaponVerificationStatus
    from .secondary_classifier import get_secondary_classifier
except ImportError:
    try:
        from analytics_config import (
            ALERT_COOLDOWN_SECONDS,
            EVENT_DEDUP_SPATIAL_BUCKET_SIZE,
            EVENT_DEDUP_TIME_BUCKET_SECONDS,
            EVENT_DEDUP_MAX_ENTRIES,
            WEAPON_VERIFICATION_WINDOW_SECONDS,
            WEAPON_MIN_DETECTIONS,
            WEAPON_MIN_CONFIDENCE,
            WEAPON_POTENTIAL_THRESHOLD,
        )
        from weapon_verifier import get_weapon_verifier, WeaponVerificationStatus
        from secondary_classifier import get_secondary_classifier
    except ImportError:
        ALERT_COOLDOWN_SECONDS = 30.0
        EVENT_DEDUP_SPATIAL_BUCKET_SIZE = 10.0
        EVENT_DEDUP_TIME_BUCKET_SECONDS = 5.0
        EVENT_DEDUP_MAX_ENTRIES = 10000
        WEAPON_VERIFICATION_WINDOW_SECONDS = 2.0
        WEAPON_MIN_DETECTIONS = 3
        WEAPON_MIN_CONFIDENCE = 0.60
        WEAPON_POTENTIAL_THRESHOLD = 0.35

logger = logging.getLogger("ibvap.rules")


def _env_float(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))

# C2 Secret Key for HMAC-SHA256 signature signing (FR-5.2)
C2_SECRET_KEY = os.getenv("IBVAP_C2_SECRET", "ibvap-tactical-c2-shared-key")
C2_WEBHOOK_URL = os.getenv("IBVAP_C2_URL", "http://localhost:8000/api/c2/mock-webhook")

# Cooldown tracking: (camera_id, rule_id, track_id) -> timestamp
_cooldown_tracker: Dict[Tuple[str, str, str], float] = {}

# Event deduplication is intentionally independent of track IDs. A detector
# can briefly lose and re-create a person, but camera/rule/class/spatial
# fingerprints still identify the same crossing. All cache settings are
# bounded so a busy camera fleet cannot grow process memory without limit.
EVENT_DEDUP_TTL_SECONDS = _env_float("IBVAP_EVENT_DEDUP_TTL_SECONDS", ALERT_COOLDOWN_SECONDS, 1.0, 3600.0)
COOLDOWN_MAX_ENTRIES = _env_int("IBVAP_COOLDOWN_MAX_ENTRIES", 10000, 64, 100_000)

_event_dedup_cache: "OrderedDict[Tuple[str, str, str, int, int], Tuple[float, str]]" = OrderedDict()
_event_dedup_lock = RLock()
_cooldown_lock = RLock()


def reset_cooldown_caches() -> None:
    """Clear all event deduplication and cooldown caches."""
    with _cooldown_lock:
        _cooldown_tracker.clear()
    with _event_dedup_lock:
        _event_dedup_cache.clear()


# C2 dead-letter / retry queue for resilient delivery (FR-5.5)
c2_retry_queue: List[Dict] = []
c2_delivery_log: List[Dict] = []


def generate_alert_id() -> str:
    """Collision-resistant ID generation for concurrent writers (FR-7.3)."""
    now = datetime.utcnow()
    rand_suffix = secrets.token_hex(6).upper()
    return f"EVT-{now.strftime('%Y%m%d%H%M%S')}-{rand_suffix}"


# ---------------------------------------------------------------------------
# Geometry Utilities for Virtual Fence (FR-4.2)
# NOTE: All virtual fence coordinates use 2D image-plane percentage space
# ([0.0..100.0] x [0.0..100.0]), NOT calibrated real-world ground distances
# or geospatial coordinates.
# ---------------------------------------------------------------------------
def _valid_point(pt: Any) -> bool:
    if not isinstance(pt, (list, tuple)) or len(pt) < 2:
        return False
    try:
        x, y = float(pt[0]), float(pt[1])
    except (TypeError, ValueError):
        return False
    return math.isfinite(x) and math.isfinite(y)


def _ccw(A: List[float], B: List[float], C: List[float]) -> bool:
    return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0])


def _orientation(A: List[float], B: List[float], C: List[float]) -> int:
    val = (B[1] - A[1]) * (C[0] - B[0]) - (B[0] - A[0]) * (C[1] - B[1])
    if abs(val) < 1e-9:
        return 0
    return 1 if val > 0 else 2


def _on_segment(A: List[float], B: List[float], C: List[float]) -> bool:
    return (
        min(A[0], C[0]) - 1e-9 <= B[0] <= max(A[0], C[0]) + 1e-9
        and min(A[1], C[1]) - 1e-9 <= B[1] <= max(A[1], C[1]) + 1e-9
    )


def line_intersect(A: List[float], B: List[float], C: List[float], D: List[float]) -> bool:
    """Returns True if line segment AB intersects line segment CD in 2D image coordinates."""
    if not (_valid_point(A) and _valid_point(B) and _valid_point(C) and _valid_point(D)):
        return False
    p1, q1, p2, q2 = [float(A[0]), float(A[1])], [float(B[0]), float(B[1])], [float(C[0]), float(C[1])], [float(D[0]), float(D[1])]
    o1 = _orientation(p1, q1, p2)
    o2 = _orientation(p1, q1, q2)
    o3 = _orientation(p2, q2, p1)
    o4 = _orientation(p2, q2, q1)

    if o1 != o2 and o3 != o4:
        return True
    if o1 == 0 and _on_segment(p1, p2, q1):
        return True
    if o2 == 0 and _on_segment(p1, q2, q1):
        return True
    if o3 == 0 and _on_segment(p2, p1, q2):
        return True
    if o4 == 0 and _on_segment(p2, q1, q2):
        return True
    return False


def _tripwire_direction_matches(
    prev_pos: List[float],
    curr_pos: List[float],
    direction: Optional[str],
) -> bool:
    """Check whether track movement between prev_pos and curr_pos matches rule direction."""
    dir_norm = (direction or "bidirectional").strip().lower()
    if dir_norm in ("", "bidirectional", "both", "entry", "exit"):
        return True
    dx = float(curr_pos[0]) - float(prev_pos[0])
    dy = float(curr_pos[1]) - float(prev_pos[1])
    if dir_norm == "left_to_right":
        return dx > 0.0
    if dir_norm == "right_to_left":
        return dx < 0.0
    if dir_norm == "top_to_bottom":
        return dy > 0.0
    if dir_norm == "bottom_to_top":
        return dy < 0.0
    return True


def point_in_polygon(point: List[float], polygon: List[List[float]]) -> bool:
    """Ray casting algorithm to determine if point [x, y] is inside polygon."""
    if not _valid_point(point) or not isinstance(polygon, (list, tuple)) or len(polygon) < 3:
        return False
    if not all(_valid_point(pt) for pt in polygon):
        return False

    x, y = float(point[0]), float(point[1])
    n = len(polygon)
    inside = False

    p1x, p1y = float(polygon[0][0]), float(polygon[0][1])
    for i in range(n + 1):
        p2x, p2y = float(polygon[i % n][0]), float(polygon[i % n][1])
        # Boundary check: treat a point lying directly on a polygon edge as inside
        if _orientation([p1x, p1y], [x, y], [p2x, p2y]) == 0 and _on_segment([p1x, p1y], [x, y], [p2x, p2y]):
            return True
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y

    return inside


def _event_timestamp(event_time: Optional[Any] = None) -> float:
    if event_time is None:
        return time.time()
    if isinstance(event_time, datetime):
        return event_time.timestamp()
    return float(event_time)


def _spatial_bucket(centroid: List[float]) -> Tuple[int, int]:
    bucket_size = EVENT_DEDUP_SPATIAL_BUCKET_SIZE
    return (
        math.floor(float(centroid[0]) / bucket_size),
        math.floor(float(centroid[1]) / bucket_size),
    )


def build_event_fingerprint(
    camera_id: str,
    rule_id: str,
    class_name: str,
    centroid: List[float],
    event_time: Optional[Any] = None,
) -> str:
    """Build a stable camera/rule/class/spatial/time event fingerprint."""
    timestamp = _event_timestamp(event_time)
    spatial_x, spatial_y = _spatial_bucket(centroid)
    time_bucket = math.floor(timestamp / EVENT_DEDUP_TIME_BUCKET_SECONDS)
    payload = "|".join(
        (
            str(camera_id),
            str(rule_id),
            str(class_name),
            str(spatial_x),
            str(spatial_y),
            str(time_bucket),
        )
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _bounded_event_ttl(cooldown_seconds: Optional[float]) -> float:
    """Clamp rule/configured TTLs to a safe bounded range."""
    if cooldown_seconds is None or float(cooldown_seconds) <= 0:
        value = EVENT_DEDUP_TTL_SECONDS
    else:
        value = float(cooldown_seconds)
    return max(1.0, min(3600.0, value))


def is_duplicate_event(
    camera_id: str,
    rule_id: str,
    class_name: str,
    centroid: List[float],
    event_time: Optional[Any] = None,
    cooldown_seconds: Optional[float] = None,
) -> bool:
    """
    Check and record a non-track-specific event fingerprint.

    Adjacent spatial buckets are considered equivalent during the TTL. This
    tolerates small detector jitter and a new track ID after a brief occlusion
    while retaining camera, rule, and class separation.
    """
    timestamp = _event_timestamp(event_time)
    ttl = _bounded_event_ttl(cooldown_seconds)
    spatial_x, spatial_y = _spatial_bucket(centroid)
    base = (str(camera_id), str(rule_id), str(class_name))
    fingerprint = build_event_fingerprint(
        camera_id,
        rule_id,
        class_name,
        centroid,
        event_time=event_time,
    )

    with _event_dedup_lock:
        # Use the event timestamp for expiry so deterministic/replayed frame
        # times remain testable and do not get compared with wall-clock time.
        # In live ingestion this is effectively ``time.time()``.
        now = timestamp
        expired = [
            key
            for key, (last_timestamp, _) in _event_dedup_cache.items()
            if (now - last_timestamp) > max(EVENT_DEDUP_TTL_SECONDS, ttl)
        ]
        for key in expired:
            _event_dedup_cache.pop(key, None)

        for neighbor_x in (spatial_x - 1, spatial_x, spatial_x + 1):
            for neighbor_y in (spatial_y - 1, spatial_y, spatial_y + 1):
                key = (*base, neighbor_x, neighbor_y)
                prior = _event_dedup_cache.get(key)
                if prior is None:
                    continue
                last_timestamp, _ = prior
                if 0.0 <= (timestamp - last_timestamp) <= ttl:
                    _event_dedup_cache.move_to_end(key)
                    return True

        key = (*base, spatial_x, spatial_y)
        _event_dedup_cache[key] = (timestamp, fingerprint)
        _event_dedup_cache.move_to_end(key)
        while len(_event_dedup_cache) > EVENT_DEDUP_MAX_ENTRIES:
            _event_dedup_cache.popitem(last=False)
    return False


# Compatibility aliases for callers/tests that use descriptive names.
event_fingerprint = build_event_fingerprint
check_event_deduplication = is_duplicate_event


def is_in_cooldown(camera_id: str, rule_id: str, track_id: str, cooldown_seconds: int) -> bool:
    key = (camera_id, rule_id, track_id)
    now = time.time()
    bounded_cooldown = _bounded_event_ttl(cooldown_seconds)
    with _cooldown_lock:
        expired = [
            cache_key
            for cache_key, triggered_at in _cooldown_tracker.items()
            if (now - triggered_at) > max(EVENT_DEDUP_TTL_SECONDS, bounded_cooldown)
        ]
        for cache_key in expired:
            _cooldown_tracker.pop(cache_key, None)

        last_triggered = _cooldown_tracker.get(key, 0.0)
        if (now - last_triggered) < bounded_cooldown:
            return True
        _cooldown_tracker[key] = now
        while len(_cooldown_tracker) > COOLDOWN_MAX_ENTRIES:
            oldest_key = min(_cooldown_tracker, key=_cooldown_tracker.get)
            _cooldown_tracker.pop(oldest_key, None)
        return False


_seen_c2_idempotency_keys: Dict[str, float] = {}


def verify_c2_replay(idempotency_key: str, timestamp_str: str, max_drift_sec: float = 300.0) -> Tuple[bool, str]:
    """FR-7.5 / V5-07: Validates timestamp drift and prevents replay attacks."""
    now = time.time()
    if idempotency_key in _seen_c2_idempotency_keys:
        return False, "Duplicate idempotency key rejected (replay protection)"

    try:
        ts_dt = datetime.fromisoformat(timestamp_str)
        drift = abs((datetime.utcnow() - ts_dt).total_seconds())
        if drift > max_drift_sec:
            return False, f"Timestamp drift ({drift:.1f}s) exceeds allowed threshold of {max_drift_sec}s"
    except Exception:
        return False, "Invalid timestamp format"

    _seen_c2_idempotency_keys[idempotency_key] = now
    if len(_seen_c2_idempotency_keys) > 1000:
        for k in list(_seen_c2_idempotency_keys.keys())[:200]:
            if (now - _seen_c2_idempotency_keys[k]) > 600:
                del _seen_c2_idempotency_keys[k]
    return True, "Valid"


def sign_c2_payload(payload_json: str) -> str:
    """HMAC-SHA256 signing for C2 tactical events (FR-5.2)."""
    return hmac.new(
        C2_SECRET_KEY.encode("utf-8"),
        payload_json.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()


def dispatch_to_c2_sync(alert_id: str, payload_dict: Dict, max_retries: int = 2) -> Dict:
    """
    FR-5.3 / FR-7.3: Real HTTP delivery with timeout, HMAC signing,
    idempotency header, and dead-letter queue tracking.
    """
    site_id = payload_dict.get("site_id", "site-alpha")
    payload_dict["site_id"] = site_id
    payload_json = json.dumps(payload_dict, sort_keys=True)
    signature = sign_c2_payload(payload_json)
    idempotency_key = f"IDEMP-{alert_id}"

    headers = {
        "Content-Type": "application/json",
        "X-IBVAP-Signature": signature,
        "X-IBVAP-Idempotency-Key": idempotency_key,
        "X-IBVAP-Timestamp": datetime.utcnow().isoformat(),
        "X-IBVAP-Site-ID": site_id
    }

    req = urllib.request.Request(
        C2_WEBHOOK_URL,
        data=payload_json.encode("utf-8"),
        headers=headers,
        method="POST"
    )

    attempt = 0
    while attempt <= max_retries:
        attempt += 1
        try:
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                status_code = resp.status
                body = resp.read().decode("utf-8")
                record = {
                    "alert_id": alert_id,
                    "site_id": site_id,
                    "status": "delivered",
                    "http_status": status_code,
                    "idempotency_key": idempotency_key,
                    "signature": signature,
                    "timestamp": datetime.utcnow().isoformat(),
                    "attempts": attempt
                }
                c2_delivery_log.append(record)
                logger.info(f"[C2 DELIVERY SUCCESS] Alert {alert_id} delivered to C2 (Attempt {attempt}, Status {status_code})")
                return record
        except Exception as ex:
            logger.warning(f"[C2 DELIVERY ATTEMPT {attempt} FAILED] {ex}")
            if attempt > max_retries:
                dead_letter = {
                    "alert_id": alert_id,
                    "site_id": site_id,
                    "status": "dead_letter",
                    "last_error": str(ex),
                    "idempotency_key": idempotency_key,
                    "payload": payload_dict,
                    "next_retry": time.time() + 60.0,
                    "attempts": attempt
                }
                c2_retry_queue.append(dead_letter)
                logger.error(f"[C2 DEAD-LETTER] Moved alert {alert_id} to dead-letter queue for background retry.")
                return dead_letter
            time.sleep(0.5)


# ---------------------------------------------------------------------------
# Rule Evaluation & Evidence Creation (FR-4, FR-8)
# ---------------------------------------------------------------------------
def evaluate_track_against_rules_sync(
    db: Session,
    camera: models.Camera,
    track: Track,
    frame_bytes: Optional[bytes] = None
) -> Optional[models.Alert]:
    """
    Synchronous evaluation of tracks against camera fence rules.
    Creates Alert, EvidenceAsset, LedgerRecord, and triggers C2 dispatch.
    """
    site_id = getattr(camera, "site_id", "site-alpha") or "site-alpha"
    if not feature_flags.is_enabled(db, site_id, "alert_ingestion"):
        logger.info("[RuleEngine] Alert ingestion disabled for site %s", site_id)
        return None

    rules = db.query(models.FenceRule).filter(
        models.FenceRule.camera_id == camera.id,
        models.FenceRule.enabled == True
    ).all()

    if not rules:
        return None

    now_ts = datetime.utcnow()

    for rule in rules:
        if rule.target_classes and track.class_name not in rule.target_classes:
            continue

        triggered = False
        trigger_reason = ""

        # Tripwire evaluation (2D image-percentage coordinates)
        if rule.rule_type == "tripwire" and isinstance(rule.coordinates, (list, tuple)) and len(rule.coordinates) >= 2:
            wire_start = rule.coordinates[0]
            wire_end = rule.coordinates[1]
            if not (_valid_point(wire_start) and _valid_point(wire_end)):
                logger.warning("[RuleEngine] Skipping tripwire rule %s with invalid coordinates", rule.id)
                continue

            if len(track.history) >= 2:
                prev_pos = track.history[-2]
                curr_pos = track.history[-1]

                if line_intersect(prev_pos, curr_pos, wire_start, wire_end) and _tripwire_direction_matches(
                    prev_pos, curr_pos, getattr(rule, "direction", "bidirectional")
                ):
                    st = track.get_event_state(f"rule:{rule.id}")
                    last_alert_time = st.get("last_alert_time", 0.0)
                    now_sec = time.time()
                    cooldown = float(getattr(rule, "cooldown_seconds", None) or ALERT_COOLDOWN_SECONDS)
                    if (now_sec - last_alert_time) >= cooldown:
                        triggered = True
                        trigger_reason = f"Tripwire '{rule.name}' crossed by {track.class_name} ({track.track_id})"
                        st["last_alert_time"] = now_sec

        # Polygon zone evaluation (2D image-percentage coordinates)
        elif rule.rule_type in ("polygon_zone", "loiter_zone") and isinstance(rule.coordinates, (list, tuple)) and len(rule.coordinates) >= 3:
            if not all(_valid_point(pt) for pt in rule.coordinates):
                logger.warning("[RuleEngine] Skipping zone rule %s with invalid coordinates", rule.id)
                continue
            curr_pos = track.centroid
            is_inside = point_in_polygon(curr_pos, rule.coordinates)
            st = track.get_event_state(f"rule:{rule.id}")
            was_inside = st.get("is_inside", False)
            last_alert_time = st.get("last_alert_time", 0.0)
            now_sec = time.time()
            cooldown = float(getattr(rule, "cooldown_seconds", None) or ALERT_COOLDOWN_SECONDS)
            zone_dir = (getattr(rule, "direction", "entry") or "entry").strip().lower()

            if is_inside:
                st["is_inside"] = True
                if rule.rule_type == "loiter_zone":
                    loiter_thresh = getattr(rule, "dwell_seconds", 4.0) or 4.0
                    if track.dwell_time >= loiter_thresh:
                        if not st.get("loiter_alert_emitted", False) or (now_sec - last_alert_time >= cooldown):
                            triggered = True
                            trigger_reason = f"Loitering in '{rule.name}' for {int(track.dwell_time)}s by {track.class_name} ({track.track_id})"
                            st["loiter_alert_emitted"] = True
                            st["last_alert_time"] = now_sec
                else:
                    # Intention-aware deduplication per Feature 2:
                    # Person enters restricted zone -> generate one intrusion alert.
                    # Person remains inside restricted zone -> suppress duplicate alerts!
                    # Person exits restricted zone and enters again -> generate new intrusion alert if cooldown elapsed.
                    if zone_dir != "exit":
                        if not was_inside:
                            if not st.get("alert_emitted", False) or (now_sec - last_alert_time >= cooldown):
                                triggered = True
                                trigger_reason = f"Zone '{rule.name}' breached by {track.class_name} ({track.track_id})"
                                st["alert_emitted"] = True
                                st["last_alert_time"] = now_sec
                        else:
                            # Person remains inside: do NOT spam alerts!
                            triggered = False
            else:
                # Outside polygon zone
                if was_inside:
                    # Target has exited the zone
                    st["is_inside"] = False
                    st["alert_emitted"] = False  # Reset entry latch so re-entry produces a new alert
                    st["loiter_alert_emitted"] = False
                    st["last_exit_time"] = now_sec
                    if rule.rule_type == "polygon_zone" and zone_dir == "exit":
                        if (now_sec - last_alert_time) >= cooldown:
                            triggered = True
                            trigger_reason = f"Zone '{rule.name}' exited by {track.class_name} ({track.track_id})"
                            st["last_alert_time"] = now_sec

        if triggered:
            # SAFETY NOTE: Clothing-based "friendly" classification has been
            # removed.  Automated visual heuristics MUST NOT silently suppress
            # a perimeter alert.  All human detections are preserved for
            # operator review.

            # Animal-Class False-Positive Suppression (Review P1):
            # Wildlife and stray cattle (cow, dog, sheep, bird) are treated as informational activity,
            # avoiding perimeter siren false alarms while keeping the sentry aware.
            if getattr(track, "is_animal", False) or track.class_name in ("cow", "dog", "horse", "sheep", "bird", "cat"):
                logger.info(f"[RuleEngine] Animal activity suppressed from perimeter siren: {track.class_name} ({track.track_id})")
                continue

            effective_cooldown = int(rule.cooldown_seconds) if getattr(rule, "cooldown_seconds", None) else int(ALERT_COOLDOWN_SECONDS)
            if is_in_cooldown(camera.id, rule.id, track.track_id, effective_cooldown):
                continue

            # Track IDs are an implementation detail and can change after an
            # occlusion. Deduplicate the semantic event using camera/rule/
            # class/spatial/time fingerprints before persisting an alert.
            event_fingerprint = build_event_fingerprint(
                camera.id,
                rule.id,
                track.class_name,
                track.centroid,
                event_time=now_ts,
            )
            if is_duplicate_event(
                camera.id,
                rule.id,
                track.class_name,
                track.centroid,
                event_time=now_ts,
                cooldown_seconds=effective_cooldown,
            ):
                logger.debug(
                    "[RuleEngine] Suppressed duplicate event fingerprint %s on %s",
                    event_fingerprint,
                    camera.id,
                )
                continue

            alert_id = generate_alert_id()
            track_provenance = getattr(track, "provenance", "detector") or "detector"
            alert_provenance = "simulation" if track_provenance in ("simulation", "fixture") else "detector"

            # NOTE: The former "crawling infiltration" heuristic (box aspect
            # ratio) has been replaced with the standard alert type.  Box
            # shape alone is not a validated posture classifier and must not
            # auto-escalate alert severity.
            alert_type = "intrusion" if rule.rule_type != "loiter_zone" else "loiter"

            # Process evidence snapshot & SHA-256 hash (FR-8.1, FR-8.2)
            snapshot_data_url = None
            content_hash = ""
            encrypted_snapshot = None

            if frame_bytes:
                content_hash = hashlib.sha256(frame_bytes).hexdigest()
                snapshot_data_url = f"data:image/jpeg;base64,{base64.b64encode(frame_bytes).decode('ascii')}"
                encrypted_snapshot = security.encrypt_field(snapshot_data_url)

            # 1. Create Alert record
            alert = models.Alert(
                id=alert_id,
                site_id=site_id,
                type=alert_type,
                sev=rule.severity,
                cam_id=camera.id,
                cam_name=camera.name,
                location=camera.location,
                confidence=int(round(track.confidence * 100)) if track.confidence <= 1.0 else int(track.confidence),
                track_id=track.track_id,
                detail_enc=security.encrypt_field(trigger_reason),
                reviewed=False,
                state="open",
                provenance=alert_provenance,
                model_version="8.2.0",
                rule_id=rule.id,
                rule_version=getattr(rule, "version", "1.0"),
                source_frame_time=now_ts,
                evidence_hash=content_hash if content_hash else None,
                event_fingerprint=event_fingerprint,
                verification_status="verified_ai",
                supporting_detections=1,
                first_detected_at=now_ts,
                last_detected_at=now_ts,
                ts=now_ts,
                snapshot_enc=encrypted_snapshot,
            )
            db.add(alert)

            # 2. Create EvidenceAsset record (FR-8.1)
            if frame_bytes and encrypted_snapshot:
                evidence_asset = models.EvidenceAsset(
                    id=f"EVD-{alert_id}",
                    site_id=site_id,
                    alert_id=alert.id,
                    camera_id=camera.id,
                    asset_type="snapshot",
                    content_hash=content_hash,
                    encrypted_data=encrypted_snapshot,
                    captured_at=now_ts,
                )
                db.add(evidence_asset)

            db.commit()
            db.refresh(alert)

            # 3. Append to SHA-256 Ledger
            ledger.append_to_ledger(db, alert)

            # 3b. Tactical Recommendation (PRD v1 FR-7)
            try:
                from . import recommendation_service
                recommendation_service.generate_tactical_recommendation(db, alert, None)
            except Exception as enrich_ex:
                logger.warning(f"[ENRICHMENT WARNING] Non-blocking recommendation error: {enrich_ex}")

            # 4. Dispatch to Real C2 Tactical Network
            if rule.severity == "high":
                c2_payload = {
                    "alert_id": alert.id,
                    "site_id": site_id,
                    "type": alert.type,
                    "sev": alert.sev,
                    "camera_id": camera.id,
                    "location": camera.location,
                    "track_id": track.track_id,
                    "timestamp": now_ts.isoformat(),
                    "evidence_hash": content_hash,
                    "provenance": alert_provenance
                }
                # Dispatch in background thread
                import threading
                threading.Thread(
                    target=dispatch_to_c2_sync,
                    args=(alert.id, c2_payload),
                    daemon=True
                ).start()

            # 5. Broadcast to WebSocket
            out = schemas.AlertOut(
                id=alert.id,
                type=alert.type,
                sev=alert.sev,
                cam_id=alert.cam_id,
                cam_name=alert.cam_name,
                location=alert.location,
                confidence=alert.confidence,
                track_id=alert.track_id,
                detail=trigger_reason,
                reviewed=False,
                state="open",
                provenance=alert_provenance,
                rule_id=rule.id,
                rule_version="1.0",
                source_frame_time=now_ts,
                evidence_hash=content_hash,
                ts=alert.ts,
                snapshot=snapshot_data_url
            )
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(manager.broadcast_alert(out.model_dump(by_alias=True)))
            except Exception:
                pass

            logger.info(f"[DETECTOR RULE] Emitted real alert {alert.id} ({alert.type}) on {camera.id}")
            return alert

    return None


def create_tamper_alert_sync(
    db: Session,
    camera: models.Camera,
    tamper_info: Dict[str, Any],
    frame_bytes: Optional[bytes] = None
) -> Optional[models.Alert]:
    """
    Generate an instantaneous SYSTEM / TAMPER alert when lens obstruction, defocus,
    or stream stall is detected (Review Section 3.1).
    """
    rule_key = f"tamper_{tamper_info.get('tamper_type', 'lens_obstruction')}"
    if is_in_cooldown(camera.id, rule_key, "system", 60.0):
        return None

    now_ts = datetime.utcnow()
    alert_id = generate_alert_id()

    snapshot_data_url = None
    content_hash = ""
    encrypted_snapshot = None

    if frame_bytes:
        content_hash = hashlib.sha256(frame_bytes).hexdigest()
        snapshot_data_url = f"data:image/jpeg;base64,{base64.b64encode(frame_bytes).decode('ascii')}"
        encrypted_snapshot = security.encrypt_field(snapshot_data_url)

    site_id = getattr(camera, "site_id", "site-alpha") or "site-alpha"
    detail = f"CAMERA HEALTH / TAMPER DETECTED: {tamper_info.get('detail', 'Sensor anomaly')}"

    alert = models.Alert(
        id=alert_id,
        site_id=site_id,
        type="tamper",
        sev=tamper_info.get("severity", "high"),
        cam_id=camera.id,
        cam_name=camera.name,
        location=camera.location,
        confidence=98,
        track_id="#SYS-TAMPER",
        detail_enc=security.encrypt_field(detail),
        reviewed=False,
        state="open",
        provenance="detector",
        model_version="health-v1.0",
        rule_id="RULE-HEALTH-TAMPER",
        rule_version="1.0",
        source_frame_time=now_ts,
        evidence_hash=content_hash if content_hash else None,
        ts=now_ts,
        snapshot_enc=encrypted_snapshot,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)

    # Append to SHA-256 Ledger
    ledger.append_to_ledger(db, alert)

    # Broadcast via WebSocket
    out = schemas.AlertOut(
        id=alert.id,
        type=alert.type,
        sev=alert.sev,
        cam_id=alert.cam_id,
        cam_name=alert.cam_name,
        location=alert.location,
        confidence=alert.confidence,
        track_id=alert.track_id,
        detail=detail,
        reviewed=False,
        state="open",
        provenance="detector",
        rule_id="RULE-HEALTH-TAMPER",
        rule_version="1.0",
        source_frame_time=now_ts,
        evidence_hash=content_hash,
        ts=alert.ts,
        snapshot=snapshot_data_url
    )
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(manager.broadcast_alert(out.model_dump(by_alias=True)))
    except Exception:
        pass

    logger.warning(f"[TAMPER ALERT] Emitted physical tamper alert {alert.id} for {camera.id}: {detail}")
    return alert


async def trigger_periodic_rule_events():
    """Background task generating periodic simulated intelligence events
    tagged with provenance='simulation' per PRD v4 FR-4."""
    if os.getenv("IBVAP_ENABLE_SIMULATION", "false").lower() != "true":
        logger.info("[SIMULATION] Periodic synthetic alert generation is disabled")
        return

    from .video_stream import get_camera_frame
    await asyncio.sleep(10)
    while True:
        try:
            await asyncio.sleep(25)
            db: Session = SessionLocal()
            try:
                event_choice = random.choice(["anpr", "watchlist", "intrusion", "loiter"])
                alert_id = generate_alert_id()
                
                if event_choice == "anpr":
                    plate = random.choice(["PB-11-AK-4471", "RJ-06-CT-1183", "HR-26-BQ-7742"])
                    cam = db.query(models.Camera).filter(models.Camera.id == "cam-2").first()
                    if not cam or not cam.online:
                        continue
                    detail = f"ANPR: Vehicle Plate {plate} matched flagged watchlist database"
                    sev = "med"
                    type_ = "anpr"
                    conf = random.randint(88, 97)
                elif event_choice == "watchlist":
                    cam = db.query(models.Camera).filter(models.Camera.id.in_(["cam-2", "cam-3"])).first()
                    if not cam or not cam.online:
                        continue
                    detail = "Match: Watchlist ID WL-009 (Tariq M. — Person of Interest)"
                    sev = "high"
                    type_ = "watchlist"
                    conf = random.randint(91, 98)
                elif event_choice == "intrusion":
                    cam = db.query(models.Camera).filter(models.Camera.id == "cam-3").first()
                    if not cam or not cam.online:
                        continue
                    detail = f"Virtual fence boundary crossed by detected object on {cam.name}"
                    sev = "high"
                    type_ = "intrusion"
                    conf = random.randint(84, 95)
                else:
                    cam = db.query(models.Camera).filter(models.Camera.id == "cam-2").first()
                    if not cam or not cam.online:
                        continue
                    detail = "Loitering detected: Target stationary > 4s near gate boundary"
                    sev = "med"
                    type_ = "loiter"
                    conf = random.randint(82, 93)

                frame_bytes = get_camera_frame(cam.id)
                snapshot_data_url = f"data:image/jpeg;base64,{base64.b64encode(frame_bytes).decode('ascii')}" if frame_bytes else None
                now_ts = datetime.utcnow()

                content_hash = hashlib.sha256(frame_bytes).hexdigest() if frame_bytes else ""
                encrypted_snapshot = security.encrypt_field(snapshot_data_url)

                alert = models.Alert(
                    id=alert_id,
                    type=type_,
                    sev=sev,
                    cam_id=cam.id,
                    cam_name=cam.name,
                    location=cam.location,
                    confidence=conf,
                    track_id=f"#{random.randint(110, 990)}",
                    detail_enc=security.encrypt_field(detail),
                    reviewed=False,
                    state="open",
                    provenance="simulation",
                    rule_id=f"rule-{cam.id}-01",
                    rule_version="1.0",
                    source_frame_time=now_ts,
                    evidence_hash=content_hash,
                    ts=now_ts,
                    snapshot_enc=encrypted_snapshot,
                )
                db.add(alert)

                if frame_bytes and encrypted_snapshot:
                    db.add(models.EvidenceAsset(
                        id=f"EVD-{alert_id}",
                        alert_id=alert.id,
                        camera_id=cam.id,
                        asset_type="snapshot",
                        content_hash=content_hash,
                        encrypted_data=encrypted_snapshot,
                        captured_at=now_ts
                    ))

                db.commit()
                db.refresh(alert)

                ledger.append_to_ledger(db, alert)

                out = schemas.AlertOut(
                    id=alert.id,
                    type=alert.type,
                    sev=alert.sev,
                    cam_id=alert.cam_id,
                    cam_name=alert.cam_name,
                    location=alert.location,
                    confidence=alert.confidence,
                    track_id=alert.track_id,
                    detail=detail,
                    reviewed=False,
                    state="open",
                    provenance="simulation",
                    rule_id=alert.rule_id,
                    rule_version="1.0",
                    source_frame_time=now_ts,
                    evidence_hash=content_hash,
                    ts=alert.ts,
                    snapshot=snapshot_data_url
                )
                await manager.broadcast_alert(out.model_dump(by_alias=True))

            finally:
                db.close()
        except Exception as e:
            logger.error(f"[SIMULATION ERROR]: {e}")
            await asyncio.sleep(5)


def evaluate_weapon_threat_sync(
    db: Session,
    camera: models.Camera,
    detection: Dict[str, Any],
    track_id: Optional[str] = None,
    frame_bytes: Optional[bytes] = None,
) -> Optional[models.Alert]:
    """
    Evaluates candidate weapon detections using temporal verification and secondary classification.
    Accumulates evidence over a rolling window (2.0s, 3 hits, >= 0.60 conf).
    Suppresses single weak detections, noise, and non-weapons (e.g. phones, remotes).
    Only promotes to 'verified_ai' when temporal verification criteria are satisfied.
    """
    class_name = detection.get("class_name", "").lower()
    confidence = float(detection.get("confidence", 0.0))
    box = detection.get("box", [0.0, 0.0, 0.0, 0.0])

    verifier = get_weapon_verifier()
    result = verifier.process_detection(
        camera_id=camera.id,
        track_id=track_id,
        detection_box=box,
        candidate_class=class_name,
        confidence=confidence,
        frame_bytes=frame_bytes,
    )

    if result.status != WeaponVerificationStatus.VERIFIED_AI:
        return None

    site_id = getattr(camera, "site_id", "site-alpha") or "site-alpha"
    now_ts = datetime.utcnow()
    alert_id = generate_alert_id()

    # Evidence snapshot & cryptographic content hash
    content_hash = ""
    encrypted_snapshot = None
    if frame_bytes:
        content_hash = hashlib.sha256(frame_bytes).hexdigest()
        snapshot_data_url = f"data:image/jpeg;base64,{base64.b64encode(frame_bytes).decode('ascii')}"
        encrypted_snapshot = security.encrypt_field(snapshot_data_url)

    mean_conf_pct = int(round(result.mean_confidence * 100))
    detail_msg = (
        f"Verified AI Weapon Alert: {result.candidate_class.upper()} verified across "
        f"{result.supporting_detections} frames (mean conf {mean_conf_pct}%) on {camera.name}"
    )
    if result.secondary_class and result.secondary_class != "uncertain":
        detail_msg += f" [Secondary Classifier: {result.secondary_class}]"

    first_dt = (
        datetime.fromtimestamp(result.first_detected_at, tz=timezone.utc)
        if isinstance(result.first_detected_at, (int, float))
        else (result.first_detected_at or now_ts)
    )
    last_dt = (
        datetime.fromtimestamp(result.last_detected_at, tz=timezone.utc)
        if isinstance(result.last_detected_at, (int, float))
        else (result.last_detected_at or now_ts)
    )

    alert = models.Alert(
        id=alert_id,
        site_id=site_id,
        type="weapon",
        sev="critical" if result.mean_confidence >= 0.75 else "high",
        cam_id=camera.id,
        cam_name=camera.name,
        location=camera.location,
        confidence=mean_conf_pct,
        track_id=result.track_id,
        detail_enc=security.encrypt_field(detail_msg),
        reviewed=False,
        state="open",
        provenance="detector",
        model_version="8.2.0",
        rule_id="rule-weapon-threat",
        rule_version="1.0",
        source_frame_time=last_dt,
        evidence_hash=content_hash if content_hash else None,
        verification_status="verified_ai",
        supporting_detections=result.supporting_detections,
        first_detected_at=first_dt,
        last_detected_at=last_dt,
        secondary_class=result.secondary_class,
        secondary_confidence=result.secondary_confidence,
        ts=now_ts,
        snapshot_enc=encrypted_snapshot,
    )
    db.add(alert)

    if frame_bytes and encrypted_snapshot:
        evidence_asset = models.EvidenceAsset(
            id=f"EVD-{alert_id}",
            site_id=site_id,
            alert_id=alert.id,
            camera_id=camera.id,
            asset_type="snapshot",
            content_hash=content_hash,
            encrypted_data=encrypted_snapshot,
            captured_at=now_ts,
        )
        db.add(evidence_asset)

    db.commit()
    db.refresh(alert)

    ledger.append_to_ledger(db, alert)

    # Tactical Recommendation enrichment
    try:
        from . import recommendation_service
        recommendation_service.generate_alert_recommendation(db, alert)
    except Exception as ex:
        logger.debug("[RuleEngine] Weapon alert enrichment deferred: %s", ex)

    return alert

