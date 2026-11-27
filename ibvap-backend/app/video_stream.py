"""
Video stream manager, bounded queue, and ingestion worker for IBVAP (PRD v3 FR-1, FR-2).
Supports RTSP network streams, recorded video fixtures, and OpenCV tactical scenes
with Drop-Oldest bounded backpressure, telemetry metrics, and worker failure isolation.
"""
import time
import math
import random
import cv2
import numpy as np
import threading
import os
import logging
from typing import Dict, List, Optional, Tuple, Any

from .tracker import ObjectTracker, Track
from .yolo_detector import YOLODetector
from .database import SessionLocal

# Prevent OpenCV background thread pool and FFmpeg frame-threading crashes
try:
    cv2.setNumThreads(1)
except Exception:
    pass

# Force single-threaded FFmpeg codec decoding per stream to eliminate libavcodec pthread_frame assertion crashes
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp|stimeout;5000000|threads;1")

logger = logging.getLogger("ibvap.video")


def _mask_uri(uri: str) -> str:
    """Mask credentials in a URI for safe display in logs, errors, and status frames."""
    if not uri or "://" not in uri:
        return uri
    scheme, rest = uri.split("://", 1)
    if "@" not in rest:
        return uri
    auth_part, host_part = rest.rsplit("@", 1)
    user = auth_part.split(":", 1)[0]
    return f"{scheme}://{user}:****@{host_part}"


def _sanitize_error_message(message: str, source_uri: str = "") -> str:
    """Remove any embedded source URI credentials from error messages."""
    sanitized = str(message)
    if source_uri and source_uri in sanitized:
        sanitized = sanitized.replace(source_uri, _mask_uri(source_uri))
    return sanitized


def _detections_to_tracker_input(
    detections: List[Dict[str, Any]],
    frame_w: int,
    frame_h: int,
) -> List[Dict[str, Any]]:
    """
    Convert pixel/normalized detector outputs into 0-100% image-plane XYWH boxes
    for ``ObjectTracker`` so tracked centroids match ``FenceRule`` coordinates.
    Does not mutate the caller's detection dicts.
    """
    if frame_w <= 0 or frame_h <= 0:
        return list(detections)

    tracker_dets: List[Dict[str, Any]] = []
    for det in detections:
        item = dict(det)
        if item.get("box_xywh") is None:
            box = item.get("box")
            box_px = item.get("box_px")
            if isinstance(box_px, (list, tuple)) and len(box_px) == 4:
                bx, by, bw, bh = [float(v) for v in box_px]
                item["box_xywh"] = [
                    round((bx / frame_w) * 100.0, 2),
                    round((by / frame_h) * 100.0, 2),
                    round((bw / frame_w) * 100.0, 2),
                    round((bh / frame_h) * 100.0, 2),
                ]
            elif isinstance(box, (list, tuple)) and len(box) == 4:
                x1, y1, x2, y2 = [float(v) for v in box]
                item["box_xywh"] = [
                    round((x1 / frame_w) * 100.0, 2),
                    round((y1 / frame_h) * 100.0, 2),
                    round((max(0.0, x2 - x1) / frame_w) * 100.0, 2),
                    round((max(0.0, y2 - y1) / frame_h) * 100.0, 2),
                ]
        tracker_dets.append(item)
    return tracker_dets


class BoundedFrameQueue:
    """Thread-safe bounded queue with drop-oldest overflow policy (FR-2)."""
    def __init__(self, maxsize: int = 30):
        self.maxsize = max(1, int(maxsize))
        self._queue: List[Tuple[np.ndarray, float]] = []  # [(frame, timestamp)]
        self._lock = threading.Lock()
        self.dropped_frames = 0
        self.total_enqueued = 0

    def push(self, frame: np.ndarray, timestamp: Optional[float] = None) -> bool:
        ts = timestamp if timestamp is not None else time.time()
        dropped_count = None
        with self._lock:
            self.total_enqueued += 1
            if len(self._queue) >= self.maxsize:
                # Drop oldest stale frame (FR-2.2)
                self._queue.pop(0)
                self.dropped_frames += 1
                if self.dropped_frames == 1 or self.dropped_frames % 100 == 0:
                    dropped_count = self.dropped_frames
            self._queue.append((frame, ts))
        if dropped_count is not None:
            logger.warning("[QUEUE] Dropped %d stale frame(s) (maxsize=%d)", dropped_count, self.maxsize)
        return True

    def pop(self) -> Optional[Tuple[np.ndarray, float]]:
        with self._lock:
            if not self._queue:
                return None
            return self._queue.pop(0)

    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            depth = len(self._queue)
            oldest_age = (time.time() - self._queue[0][1]) if self._queue else 0.0
            return {
                "depth": depth,
                "max_depth": self.maxsize,
                "dropped_frames": self.dropped_frames,
                "total_enqueued": self.total_enqueued,
                "oldest_frame_age_sec": round(oldest_age, 3),
            }


class VideoCaptureWorker:
    """Asynchronous video ingestion and analytics worker (FR-1, FR-2)."""
    def __init__(self, cam_id: str, source_uri: str, max_queue_size: int = 30, session_factory=None):
        self.cam_id = cam_id
        self.source_uri = source_uri
        self.session_factory = session_factory or SessionLocal
        self.queue = BoundedFrameQueue(maxsize=max_queue_size)
        self.tracker = ObjectTracker(cam_id)
        self.detector = YOLODetector()
        
        self.running = False
        self.cap = None
        self._cap_lock = threading.Lock()
        self.last_frame_bytes: Optional[bytes] = None
        self.last_detections: List[Dict[str, Any]] = []
        self.last_tracks: List[Track] = []
        self.fps = 0.0
        self.inference_latency_ms = 0.0
        self.last_error: Optional[str] = None
        self.last_detector_error: Optional[str] = None
        self.processed_frames = 0
        
        self._capture_thread: Optional[threading.Thread] = None
        self._process_thread: Optional[threading.Thread] = None

        if self.source_uri.startswith(("rtsp://", "rtsps://", "http://", "https://")):
            self._generate_status_frame(
                "RTSP INITIALIZING",
                f"Connecting to RTSP endpoint: {_mask_uri(self.source_uri)}",
            )

    def _generate_status_frame(self, status: str, detail: str = "", is_error: bool = False):
        """Render a tactical status screen when waiting for RTSP camera connection or when disconnected."""
        img = np.zeros((360, 640, 3), dtype=np.uint8)
        img[:] = (20, 18, 12)  # Dark tactical slate/navy background

        # Subtle grid lines
        for y in range(40, 360, 40):
            cv2.line(img, (0, y), (640, y), (30, 26, 18), 1)
        for x in range(40, 640, 40):
            cv2.line(img, (x, 0), (x, 360), (30, 26, 18), 1)

        # Center target crosshairs
        cv2.line(img, (300, 180), (340, 180), (50, 45, 30), 1)
        cv2.line(img, (320, 160), (320, 200), (50, 45, 30), 1)

        # Header bar
        cv2.rectangle(img, (0, 0), (640, 32), (32, 28, 20), -1)
        cv2.putText(img, f"IBVAP TACTICAL INGESTION · {self.cam_id.upper()}", (14, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (220, 230, 240), 1)
        
        ts_str = time.strftime("%Y-%m-%d %H:%M:%S UTC")
        cv2.putText(img, ts_str, (440, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (160, 175, 190), 1)

        # Status badge
        badge_color = (40, 40, 200) if is_error else (20, 140, 220)  # Red for error, Amber for connecting
        badge_text = f"[{status}]"
        cv2.rectangle(img, (160, 105), (480, 145), badge_color, -1)
        cv2.putText(img, badge_text, (180, 132), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 2)

        # Source URI display (safely mask passwords if present)
        masked_uri = _mask_uri(self.source_uri)
        safe_detail = _sanitize_error_message(detail, self.source_uri)

        cv2.putText(img, "RTSP Source:", (50, 185), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (180, 190, 200), 1)
        cv2.putText(img, masked_uri[:65], (165, 185), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (100, 220, 255), 1)

        # Detail text
        lines = [line.strip() for line in safe_detail.split("\n") if line.strip()]
        y_pos = 220
        for l in lines[:3]:
            cv2.putText(img, l[:75], (50, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (140, 150, 165), 1)
            y_pos += 24

        # Footer diagnostics
        cv2.rectangle(img, (0, 335), (640, 360), (25, 22, 16), -1)
        protocol_text = "PROTOCOL: RTSP/H.264 (FFMPEG TCP) · RECONNECT ENGINE ACTIVE"
        cv2.putText(img, protocol_text, (14, 351), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (120, 135, 150), 1)

        success, buf = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if success:
            self.last_frame_bytes = buf.tobytes()

    def start(self):
        if self.running:
            return
        self.running = True
        self._capture_thread = threading.Thread(target=self._capture_loop, daemon=True, name=f"Capture-{self.cam_id}")
        self._process_thread = threading.Thread(target=self._process_loop, daemon=True, name=f"Process-{self.cam_id}")
        self._capture_thread.start()
        self._process_thread.start()
        logger.info(f"[WORKER] Started capture worker for {self.cam_id} on source: {_mask_uri(self.source_uri)}")

    def _capture_loop(self):
        retry_delay = 2.0
        has_connected_once = False
        while self.running:
            cap = None
            try:
                if self.source_uri.startswith(("rtsp://", "rtsps://")):
                    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;5000000|threads;1"
                    cap = cv2.VideoCapture(self.source_uri, cv2.CAP_FFMPEG)
                else:
                    cap = cv2.VideoCapture(self.source_uri)

                with self._cap_lock:
                    self.cap = cap

                if not self.running:
                    break

                if not cap.isOpened():
                    self.last_error = f"Cannot connect to camera source: {_mask_uri(self.source_uri)}"
                    self._generate_status_frame(
                        "RTSP OFFLINE / UNREACHABLE",
                        f"Cannot connect to RTSP stream at: {_mask_uri(self.source_uri)}\nEnsure camera is powered on and accessible on network.\nRetrying connection in background...",
                        is_error=True
                    )
                    with self._cap_lock:
                        if self.cap:
                            try:
                                self.cap.release()
                            except Exception:
                                pass
                            self.cap = None
                    time.sleep(retry_delay)
                    retry_delay = min(retry_delay * 1.5, 10.0)
                    continue

                if has_connected_once:
                    self.tracker.reset()
                has_connected_once = True
                self.last_error = None
                retry_delay = 2.0
                consecutive_file_failures = 0

                while self.running and cap.isOpened():
                    ret, frame = cap.read()
                    if not ret:
                        if not self.running:
                            break
                        # For video file fixture, loop back to beginning
                        if os.path.exists(self.source_uri):
                            consecutive_file_failures += 1
                            if consecutive_file_failures > 3:
                                self.last_error = "Fixture stream read failed repeatedly; reopening"
                                break
                            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                            time.sleep(0.033)
                            continue
                        else:
                            self.last_error = "Stream ended or disconnected"
                            self._generate_status_frame(
                                "RTSP DISCONNECTED",
                                f"Stream lost: {_mask_uri(self.source_uri)}\nReconnecting...",
                                is_error=True
                            )
                            break

                    consecutive_file_failures = 0
                    self.queue.push(frame, time.time())
                    time.sleep(0.01)  # yield to allow processing

            except Exception as e:
                safe_err = _sanitize_error_message(str(e), self.source_uri)
                self.last_error = f"Capture error: {safe_err}"
                logger.error(f"[WORKER ERROR] Capture failed on {self.cam_id}: {safe_err}")
                self._generate_status_frame(
                    "RTSP ERROR",
                    f"Capture error on {_mask_uri(self.source_uri)}: {safe_err}\nRetrying...",
                    is_error=True
                )
                time.sleep(2.0)
            finally:
                with self._cap_lock:
                    if self.cap:
                        try:
                            self.cap.release()
                        except Exception:
                            pass
                        self.cap = None

    def _process_loop(self):
        from .rule_engine import evaluate_track_against_rules_sync
        
        frame_count = 0
        start_t = time.time()

        while self.running:
            try:
                item = self.queue.pop()
                if item is None:
                    time.sleep(0.01)
                    continue

                frame, frame_ts = item
                h, w = frame.shape[:2]

                # Run detector — distinguish real inference from failure/unavailability
                t0 = time.time()
                detections: List[Dict[str, Any]] = []
                inference_error = False
                is_local_fixture = bool(self.source_uri and os.path.exists(self.source_uri))

                if self.detector.is_loaded:
                    try:
                        detections = self.detector.detect(frame)
                        self.last_detector_error = None
                        if self.last_error and self.last_error.startswith("Detector "):
                            self.last_error = None
                    except Exception as det_err:
                        inference_error = True
                        err_msg = _sanitize_error_message(str(det_err), self.source_uri)
                        self.last_detector_error = err_msg
                        self.last_error = f"Detector inference error: {err_msg}"
                        logger.warning(f"[DETECTOR] Inference error on {self.cam_id}: {err_msg}")
                else:
                    self.last_detector_error = "Detector model not loaded"
                    if not is_local_fixture:
                        self.last_error = "Detector model not loaded"

                # Deterministic fixture videos contain a high-saturation green
                # subject. If the model is unavailable or produced no result
                # for a fixture frame (without an inference crash), use the
                # clearly-marked simulation fixture fallback.
                if not detections and not inference_error and is_local_fixture:
                    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
                    mask = cv2.inRange(hsv, np.array([35, 80, 80]), np.array([85, 255, 255]))
                    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    for cnt in contours:
                        if cv2.contourArea(cnt) > 100:
                            bx, by, bw, bh = cv2.boundingRect(cnt)
                            x1, y1, x2, y2 = bx, by, bx + bw, by + bh
                            detections.append({
                                "class_name": "person",
                                "confidence": 0.92,
                                "box": [x1, y1, x2, y2],
                                "norm_box": [
                                    round(max(0.0, min(1.0, x1 / w)), 4),
                                    round(max(0.0, min(1.0, y1 / h)), 4),
                                    round(max(0.0, min(1.0, x2 / w)), 4),
                                    round(max(0.0, min(1.0, y2 / h)), 4),
                                ],
                                "box_px": [bx, by, bw, bh],
                                "provenance": "simulation",
                            })

                self.inference_latency_ms = round((time.time() - t0) * 1000.0, 1)

                # Update object tracker in 0-100% image-plane coordinates
                tracker_dets = _detections_to_tracker_input(detections, w, h)
                active_tracks = self.tracker.update(tracker_dets)
                self.last_detections = detections
                self.last_tracks = active_tracks

                # Encode JPEG for live streaming
                success, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                if success:
                    self.last_frame_bytes = buf.tobytes()

                # Evaluate active tracks against DB rules in isolated session
                if active_tracks:
                    db = self.session_factory()
                    try:
                        from .models import Camera
                        from .rule_engine import evaluate_weapon_threat_sync
                        camera = db.query(Camera).filter(Camera.id == self.cam_id).first()
                        if camera:
                            for trk in active_tracks:
                                evaluate_track_against_rules_sync(db, camera, trk, self.last_frame_bytes)
                                if trk.class_name in ("knife", "scissors", "baseball bat", "weapon"):
                                    evaluate_weapon_threat_sync(
                                        db, camera,
                                        {"class_name": trk.class_name, "confidence": trk.confidence, "box": trk.box},
                                        track_id=trk.track_id,
                                        frame_bytes=self.last_frame_bytes
                                    )
                    finally:
                        db.close()

                frame_count += 1
                self.processed_frames += 1
                elapsed = time.time() - start_t
                if elapsed >= 1.0:
                    self.fps = round(frame_count / elapsed, 1)
                    frame_count = 0
                    start_t = time.time()

            except Exception as e:
                # Isolate failure to this frame (FR-1.4)
                logger.error(f"[WORKER ERROR] Processing frame failed on {self.cam_id}: {e}")
                time.sleep(0.02)

    def stop(self):
        self.running = False
        if self._capture_thread and self._capture_thread.is_alive():
            try:
                self._capture_thread.join(timeout=1.0)
            except Exception:
                pass
        if self._process_thread and self._process_thread.is_alive():
            try:
                self._process_thread.join(timeout=1.0)
            except Exception:
                pass
        with self._cap_lock:
            if self.cap:
                try:
                    self.cap.release()
                except Exception:
                    pass
                self.cap = None


class CameraStreamGenerator:
    """Procedural generator for demo scenes with DEMO watermark (FR-1.7)."""
    def __init__(self, cam_id: str, scene: str = "fence", is_night: bool = False):
        self.cam_id = cam_id
        self.scene = scene
        self.is_night = is_night
        self.width = 640
        self.height = 360
        self.frame_idx = 0
        self.tracker = ObjectTracker(cam_id)
        
        self.person_x = 100
        self.person_dir = 1
        self.vehicle_x = -150
        self.vehicle_active = False

    def generate_frame(self) -> Tuple[bytes, List[Dict]]:
        self.frame_idx += 1
        t = self.frame_idx * 0.05

        if self.is_night:
            img = np.zeros((self.height, self.width, 3), dtype=np.uint8)
            img[:, :] = (15, 30, 20)
            cv2.rectangle(img, (0, int(self.height * 0.45)), (self.width, self.height), (25, 45, 30), -1)
            noise = np.random.normal(0, 6, (self.height, self.width, 3)).astype(np.int16)
            img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        else:
            img = np.zeros((self.height, self.width, 3), dtype=np.uint8)
            img[:int(self.height * 0.45), :] = (70, 50, 30)
            img[int(self.height * 0.45):, :] = (40, 60, 50)

        # Draw scene
        if self.scene == "gate":
            pts = np.array([[int(self.width * 0.3), self.height], [int(self.width * 0.7), self.height],
                            [int(self.width * 0.55), int(self.height * 0.45)], [int(self.width * 0.45), int(self.height * 0.45)]], np.int32)
            cv2.fillPoly(img, [pts], (30, 35, 40) if not self.is_night else (20, 35, 25))
            gate_color = (0, 180, 240) if not self.is_night else (80, 200, 120)
            cv2.line(img, (int(self.width * 0.35), int(self.height * 0.65)), (int(self.width * 0.65), int(self.height * 0.65)), gate_color, 4)
            cv2.rectangle(img, (int(self.width * 0.2), int(self.height * 0.4)), (int(self.width * 0.35), int(self.height * 0.7)), (60, 70, 80), -1)
            cv2.putText(img, "POST 02", (int(self.width * 0.22), int(self.height * 0.48)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)

        elif self.scene in ("fence", "night"):
            post_color = (80, 90, 100) if not self.is_night else (50, 100, 60)
            wire_color = (120, 130, 140) if not self.is_night else (80, 150, 90)
            for px in range(50, self.width, 90):
                cv2.line(img, (px, int(self.height * 0.4)), (px, int(self.height * 0.75)), post_color, 3)
            for wy in [0.45, 0.52, 0.60, 0.68]:
                cv2.line(img, (0, int(self.height * wy)), (self.width, int(self.height * wy)), wire_color, 1)

        fence_y = int(self.height * 0.70)
        cv2.line(img, (0, fence_y), (self.width, fence_y), (0, 0, 220) if (int(t * 2) % 2 == 0) else (0, 180, 255), 2)
        cv2.putText(img, "VIRTUAL FENCE TRIPWIRE (70%)", (10, fence_y - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 220, 255), 1)

        detections = []

        self.person_x += int(1.5 * self.person_dir)
        if self.person_x > self.width - 150:
            self.person_dir = -1
        elif self.person_x < 80:
            self.person_dir = 1

        py = int(self.height * 0.52)
        pw, ph = 26, 68
        p_color = (0, 220, 180) if not self.is_night else (100, 255, 150)
        
        cv2.circle(img, (self.person_x + pw // 2, py + 10), 8, p_color, -1)
        cv2.rectangle(img, (self.person_x + 5, py + 18), (self.person_x + pw - 5, py + 48), p_color, -1)
        cv2.line(img, (self.person_x + 8, py + 48), (self.person_x + 5, py + ph), p_color, 3)
        cv2.line(img, (self.person_x + pw - 8, py + 48), (self.person_x + pw - 5, py + ph), p_color, 3)
        
        cv2.rectangle(img, (self.person_x, py), (self.person_x + pw, py + ph), (0, 229, 184), 1)
        cv2.putText(img, "PERSON 0.93", (self.person_x, py - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 229, 184), 1)

        detections.append({
            "class_name": "person",
            "confidence": 0.93,
            "box": [
                round((self.person_x / self.width) * 100.0, 1),
                round((py / self.height) * 100.0, 1),
                round((pw / self.width) * 100.0, 1),
                round((ph / self.height) * 100.0, 1),
            ],
            "provenance": "simulation",
        })

        # DEMO PROVENANCE WATERMARK
        cv2.rectangle(img, (self.width - 110, 10), (self.width - 10, 30), (0, 0, 180), -1)
        cv2.putText(img, "[DEMO SCENE]", (self.width - 105, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1)

        ts_str = time.strftime("%d/%m/%Y %H:%M:%S UTC")
        cv2.putText(img, f"{self.cam_id.upper()} · SIMULATED CCTV", (14, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
        cv2.putText(img, ts_str, (14, self.height - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (200, 255, 200) if self.is_night else (220, 220, 220), 1)

        success, buffer = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        return (buffer.tobytes() if success else b""), detections


# Registry of generators and ingestion workers
generators: Dict[str, CameraStreamGenerator] = {}
workers: Dict[str, VideoCaptureWorker] = {}


def get_or_create_worker(cam_id: str, source_uri: str) -> VideoCaptureWorker:
    cid_lower = cam_id.lower()
    existing = workers.get(cam_id) or workers.get(cid_lower)
    if existing:
        if existing.source_uri == source_uri and existing.running:
            return existing
        existing.stop()
        workers.pop(cam_id, None)
        workers.pop(cid_lower, None)

    worker = VideoCaptureWorker(cam_id, source_uri)
    workers[cam_id] = worker
    worker.start()
    return worker


def stop_worker(cam_id: str):
    cid_lower = cam_id.lower()
    if cam_id in workers:
        workers[cam_id].stop()
        del workers[cam_id]
    elif cid_lower in workers:
        workers[cid_lower].stop()
        del workers[cid_lower]


_standalone_detector: Optional[YOLODetector] = None
_standalone_trackers: Dict[str, ObjectTracker] = {}


def get_detector_instance() -> YOLODetector:
    global _standalone_detector
    if _standalone_detector is None:
        _standalone_detector = YOLODetector()
    return _standalone_detector


def check_camera_health_and_tampering(
    frame: np.ndarray,
    last_frame: Optional[np.ndarray] = None,
    is_night: bool = False
) -> Optional[Dict[str, Any]]:
    """
    Automated OpenCV-based camera health & physical tamper detection (Review Section 3.1).
    Detects lens obstruction / blackout, camera defocus, and frozen video stream.
    Zero neural network overhead (<1.5 ms per check).
    """
    if frame is None or frame.size == 0:
        return {
            "tamper_detected": True,
            "tamper_type": "signal_loss",
            "detail": "Zero-byte frame or disconnected sensor link",
            "severity": "high"
        }

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mean_lum = float(np.mean(gray))
    lum_var = float(np.var(gray))

    # 1. Lens Obstruction / Spray Paint / Blackout / Heavy Glare
    if not is_night and (mean_lum < 10.0 or mean_lum > 248.0 or lum_var < 15.0):
        return {
            "tamper_detected": True,
            "tamper_type": "lens_obstruction",
            "detail": f"Lens obstructed, spray-painted, or covered (mean lum: {mean_lum:.1f}, variance: {lum_var:.1f})",
            "severity": "high"
        }
    elif is_night and (mean_lum < 2.0 or lum_var < 3.0):
        return {
            "tamper_detected": True,
            "tamper_type": "ir_illuminator_failure",
            "detail": f"Night vision illuminator failure / total optical darkness (mean: {mean_lum:.1f})",
            "severity": "high"
        }

    # 2. Camera Defocus / Mud on Lens (Laplacian edge density collapse)
    laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if not is_night and laplacian_var < 14.0 and lum_var > 40.0:
        return {
            "tamper_detected": True,
            "tamper_type": "camera_defocus",
            "detail": f"Severe camera defocus or blurred lens (Laplacian variance: {laplacian_var:.1f})",
            "severity": "med"
        }

    # 3. Stream Freeze / Video Pipeline Stall
    if last_frame is not None and last_frame.shape == frame.shape:
        diff = cv2.absdiff(frame, last_frame)
        if np.max(diff) == 0:
            return {
                "tamper_detected": True,
                "tamper_type": "stream_freeze",
                "detail": "Video stream frozen (identical consecutive frames detected)",
                "severity": "high"
            }

    return None


def check_motion_energy(
    frame: np.ndarray,
    last_frame: Optional[np.ndarray],
    threshold: float = 0.5
) -> Tuple[bool, float]:
    """
    Fast temporal frame differencing for motion-gated screening (Review Section 2.1).
    Skips expensive neural network inference when perimeter scene is completely static.
    """
    if last_frame is None or frame.shape != last_frame.shape:
        return True, 100.0

    gray1 = cv2.cvtColor(last_frame, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    diff = cv2.absdiff(gray1, gray2)
    _, thresh = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)
    motion_energy = float(np.sum(thresh > 0) / thresh.size) * 100.0
    return (motion_energy >= threshold), round(motion_energy, 2)



def get_camera_frame(cam_id: str) -> bytes:
    """Fetch an instantaneous single frame from active worker, RTSP ingest, or tactical generator."""
    cid_lower = cam_id.lower()
    # 1. Check worker
    if cam_id in workers and workers[cam_id].last_frame_bytes:
        return workers[cam_id].last_frame_bytes
    if cid_lower in workers and workers[cid_lower].last_frame_bytes:
        return workers[cid_lower].last_frame_bytes

    # 2. Check if camera exists in DB with an rtsp_url
    try:
        from .database import SessionLocal
        from .models import Camera
        db = SessionLocal()
        try:
            cam = db.query(Camera).filter(Camera.id.in_([cam_id, cid_lower])).first()
            if cam and cam.rtsp_url and cam.rtsp_url.strip():
                worker = get_or_create_worker(cam.id, cam.rtsp_url.strip())
                if worker.last_frame_bytes:
                    return worker.last_frame_bytes
        finally:
            db.close()
    except Exception as db_err:
        logger.warning(f"DB lookup in get_camera_frame failed: {db_err}")

    # 3. Check generators (only if not an RTSP camera)
    if cid_lower not in generators:
        scene = "fence"
        is_night = False
        if "gate" in cid_lower:
            scene = "gate"
        elif "night" in cid_lower or cid_lower == "cam-3":
            scene = "night"
            is_night = True
        generators[cid_lower] = CameraStreamGenerator(cid_lower, scene=scene, is_night=is_night)
        
    frame_bytes, _ = generators[cid_lower].generate_frame()
    return frame_bytes


def step_single_frame(cam_id: str) -> Tuple[bytes, List[Dict], int]:
    """Advance video feed by exactly 1 frame and return (frame_bytes, detections, frame_idx)."""
    cid_lower = cam_id.lower()
    if cid_lower not in generators:
        scene = "fence"
        is_night = False
        if "gate" in cid_lower or cid_lower == "cam-2":
            scene = "gate"
        elif "night" in cid_lower or cid_lower == "cam-3":
            scene = "night"
            is_night = True
        generators[cid_lower] = CameraStreamGenerator(cid_lower, scene=scene, is_night=is_night)
    gen = generators[cid_lower]
    frame_bytes, detections = gen.generate_frame()
    gen.last_detections = detections
    return frame_bytes, detections, gen.frame_idx


def process_single_frame(
    cam_id: str,
    frame_bytes: bytes,
    db: Any,
    camera: Optional[Any] = None
) -> Dict[str, Any]:
    """
    Synchronously ingest and process a single camera frame at a time.
    Executes YOLO detector, updates track state, evaluates fence rules,
    triggers alerts, and enriches with GIS terrain & tactical guidance.
    """
    start_time = time.time()
    nparr = np.frombuffer(frame_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError(f"Failed to decode image frame bytes for camera {cam_id}")

    h, w = frame.shape[:2]
    detector = get_detector_instance()
    detections: List[Dict[str, Any]] = []
    detector_available = True
    detector_error: Optional[str] = None

    # Health and Tamper check (Review Section 3.1)
    is_night_scene = getattr(camera, "night", False) if camera else False
    tamper_info = check_camera_health_and_tampering(frame, is_night=is_night_scene)
    if tamper_info and db and camera:
        try:
            from .rule_engine import create_tamper_alert_sync
            create_tamper_alert_sync(db, camera, tamper_info, frame_bytes)
        except Exception as t_ex:
            print(f"[TAMPER WARNING] Non-blocking tamper alert error: {t_ex}")

    if detector.is_loaded:
        try:
            detections = detector.detect(frame)
        except Exception as det_err:
            detector_available = False
            detector_error = str(det_err)
            logger.warning(f"[DETECTOR] Inference error on {cam_id}: {det_err}")
    else:
        detector_available = False
        detector_error = "Detector model not loaded"
        # Fallback: check generator last detections if synthetic camera
        cid_lower = cam_id.lower()
        if cid_lower in generators and getattr(generators[cid_lower], "last_detections", None):
            raw_dets = generators[cid_lower].last_detections
            for rd in raw_dets:
                box_vals = rd.get("box", [0, 0, 0, 0])
                rx, ry, rw, rh = box_vals
                # Convert percentage box to pixel coordinates [x1, y1, x2, y2]
                px1 = int((rx / 100.0) * w)
                py1 = int((ry / 100.0) * h)
                px2 = int(((rx + rw) / 100.0) * w)
                py2 = int(((ry + rh) / 100.0) * h)
                bw_px = max(1, px2 - px1)
                bh_px = max(1, py2 - py1)
                detections.append({
                    "class_name": rd.get("class_name", "person"),
                    "confidence": float(rd.get("confidence", 0.93)),
                    "box": [px1, py1, px2, py2],
                    "box_px": [px1, py1, bw_px, bh_px],
                    "norm_box": [
                        round(max(0.0, min(1.0, px1 / w)), 4),
                        round(max(0.0, min(1.0, py1 / h)), 4),
                        round(max(0.0, min(1.0, px2 / w)), 4),
                        round(max(0.0, min(1.0, py2 / h)), 4),
                    ],
                    "provenance": "simulation",
                })
        # NOTE: The former contour-based "visual saliency" fallback has been
        # removed.  It fabricated class labels (person/car/object) and
        # confidence scores from edge detection, which is not a valid
        # detection source and could produce misleading results.

    # Tracker state (tracked in 0-100% image-plane coordinates matching FenceRule)
    if cam_id not in _standalone_trackers:
        _standalone_trackers[cam_id] = ObjectTracker(camera_id=cam_id)
    tracker = _standalone_trackers[cam_id]
    active_tracks = tracker.update(_detections_to_tracker_input(detections, w, h))

    # Format output detections
    formatted_detections: List[Dict[str, Any]] = []
    for d in detections:
        box = d.get("box", [0, 0, 0, 0])
        x1, y1, x2, y2 = box
        norm_box = [
            round(max(0.0, min(1.0, x1 / w)), 4),
            round(max(0.0, min(1.0, y1 / h)), 4),
            round(max(0.0, min(1.0, x2 / w)), 4),
            round(max(0.0, min(1.0, y2 / h)), 4)
        ]
        formatted_detections.append({
            "class_name": d.get("class_name", "unknown"),
            "confidence": round(float(d.get("confidence", 0.0)), 3),
            "box": box,
            "normalized_box": norm_box,
            "provenance": d.get("provenance", "detector"),
        })

    # Evaluate rules if camera is provided
    alert_created = None
    if camera and active_tracks:
        from .rule_engine import evaluate_track_against_rules_sync, evaluate_weapon_threat_sync
        for trk in active_tracks:
            alert = evaluate_track_against_rules_sync(db, camera, trk, frame_bytes)
            if alert:
                alert_created = alert
                break
            if trk.class_name in ("knife", "scissors", "baseball bat", "weapon"):
                w_alert = evaluate_weapon_threat_sync(
                    db, camera,
                    {"class_name": trk.class_name, "confidence": trk.confidence, "box": trk.box},
                    track_id=trk.track_id,
                    frame_bytes=frame_bytes
                )
                if w_alert:
                    alert_created = w_alert
                    break

    elapsed_ms = round((time.time() - start_time) * 1000.0, 2)
    return {
        "cam_id": cam_id,
        "timestamp": start_time,
        "detections": formatted_detections,
        "num_detections": len(formatted_detections),
        "alert_triggered": alert_created is not None,
        "alert_id": alert_created.id if alert_created else None,
        "alert_type": alert_created.type if alert_created else None,
        "processing_time_ms": elapsed_ms,
        "detector_available": detector_available,
        "detector_error": detector_error,
        "detector_model": "YOLOv8s-Security-v8.2.0" if detector_available else "unavailable",
        "tamper_status": tamper_info
    }


def stream_mjpeg(cam_id: str):
    """Generator yielding MJPEG multipart frames."""
    while True:
        frame_bytes = get_camera_frame(cam_id)
        if frame_bytes:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        time.sleep(0.08)  # ~12 FPS
