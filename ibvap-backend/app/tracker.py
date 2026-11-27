"""
Multi-Object Tracker for IBVAP Backend (PRD v2.0 FR-3.4 / FR-3.5).
Assigns persistent per-camera track IDs, estimates direction vectors,
and computes dwell duration for spatial and behavioral rules.
"""
import logging
import math
import os
import time
from collections import OrderedDict
from typing import List, Dict, Optional, Tuple, Any

logger = logging.getLogger("ibvap.tracker")

try:
    from .analytics_config import (
        TRACKER_MAX_MISSED_FRAMES,
        TRACKER_IOU_THRESHOLD,
        TRACKER_LOST_TTL_SECONDS,
        TRACKER_LOST_MAX_SIZE,
    )
except ImportError:
    try:
        from analytics_config import (
            TRACKER_MAX_MISSED_FRAMES,
            TRACKER_IOU_THRESHOLD,
            TRACKER_LOST_TTL_SECONDS,
            TRACKER_LOST_MAX_SIZE,
        )
    except ImportError:
        TRACKER_MAX_MISSED_FRAMES = 10
        TRACKER_IOU_THRESHOLD = 0.25
        TRACKER_LOST_TTL_SECONDS = 15.0
        TRACKER_LOST_MAX_SIZE = 256


def compute_iou(boxA: List[float], boxB: List[float]) -> float:
    """Compute Intersection over Union between two bounding boxes [x, y, w, h]."""
    wA = max(0.0, float(boxA[2]))
    hA = max(0.0, float(boxA[3]))
    wB = max(0.0, float(boxB[2]))
    hB = max(0.0, float(boxB[3]))

    xA = max(float(boxA[0]), float(boxB[0]))
    yA = max(float(boxA[1]), float(boxB[1]))
    xB = min(float(boxA[0]) + wA, float(boxB[0]) + wB)
    yB = min(float(boxA[1]) + hA, float(boxB[1]) + hB)

    inter_w = max(0.0, xB - xA)
    inter_h = max(0.0, yB - yA)
    inter_area = inter_w * inter_h

    boxA_area = wA * hA
    boxB_area = wB * hB
    union_area = boxA_area + boxB_area - inter_area

    if union_area <= 0:
        return 0.0
    return inter_area / union_area


def _is_valid_box(box: Any) -> bool:
    if not isinstance(box, (list, tuple)) or len(box) != 4:
        return False
    try:
        vals = [float(v) for v in box]
    except (TypeError, ValueError):
        return False
    return all(math.isfinite(v) for v in vals)


def _centroid(box: List[float]) -> List[float]:
    return [box[0] + box[2] / 2.0, box[1] + box[3] / 2.0]


def _detection_box(detection: Dict) -> List[float]:
    """
    Return a detection in the tracker's canonical ``[x, y, w, h]`` form.

    The original public tracker API accepts ``box`` as XYWH.  The detector
    also exposes pixel XYWH as ``box_px`` and some ingestion paths expose
    XYXY as ``box``.  Explicit format metadata keeps those paths compatible
    without relying on an ambiguous coordinate heuristic.
    """
    if detection.get("box_xywh") is not None:
        return list(detection["box_xywh"])
    if detection.get("box") is None and detection.get("box_px") is not None:
        return list(detection["box_px"])
    box = list(detection["box"])
    if detection.get("box_format", "xywh").lower() == "xyxy":
        return [box[0], box[1], max(0.0, box[2] - box[0]), max(0.0, box[3] - box[1])]
    # YOLO's legacy payload includes both XYXY ``box`` and pixel XYWH
    # ``box_px`` without a format marker. Detect that exact relationship;
    # synthetic fixture payloads use percentage XYWH and therefore remain on
    # the original public coordinate path.
    pixel_box = detection.get("box_px")
    if pixel_box is not None and len(pixel_box) == 4:
        if (
            abs(float(box[0]) - float(pixel_box[0])) < 1e-6
            and abs(float(box[1]) - float(pixel_box[1])) < 1e-6
            and abs(float(box[2]) - float(box[0]) - float(pixel_box[2])) < 1e-6
            and abs(float(box[3]) - float(box[1]) - float(pixel_box[3])) < 1e-6
        ):
            return list(pixel_box)
    return box


class Track:
    def __init__(
        self,
        track_id: str,
        box: List[float],
        class_name: str,
        confidence: float,
        person_type: Optional[str] = None,
        is_friendly: bool = False,
        uniform_pattern: Optional[str] = None,
        provenance: str = "detector",
    ):
        self.track_id = track_id
        self.class_name = class_name
        self.confidence = confidence
        self.box = box  # [x, y, w, h] in normalized % (0-100) or pixels
        self.person_type = person_type
        self.is_friendly = is_friendly
        self.uniform_pattern = uniform_pattern
        self.provenance = provenance
        self.centroid = [box[0] + box[2] / 2.0, box[1] + box[3] / 2.0]
        self.history: List[List[float]] = [self.centroid]  # list of centroids
        self.first_seen = time.time()
        self.last_seen = time.time()
        self.missed_frames = 0
        self.hit_streak = 1
        self.direction = "stationary"  # left_to_right | right_to_left | top_to_bottom | bottom_to_top
        self.velocity = [0.0, 0.0]
        self.lost_at: Optional[float] = None
        # Persistent per-track event states for intelligent deduplication across event types
        self.event_states: Dict[str, Dict[str, Any]] = {}

    def get_event_state(self, event_key: str) -> Dict[str, Any]:
        """Retrieve or initialize state dictionary for a specific event type / rule."""
        return self.event_states.setdefault(event_key, {})

    def set_event_state(self, event_key: str, state: Dict[str, Any]) -> None:
        """Update event state dictionary for a specific event type / rule."""
        self.event_states[event_key] = state

    def clear_event_state(self, event_key: str) -> None:
        """Clear event state for a specific event type / rule."""
        self.event_states.pop(event_key, None)

    def update(
        self,
        box: List[float],
        confidence: float,
        person_type: Optional[str] = None,
        is_friendly: Optional[bool] = None,
        uniform_pattern: Optional[str] = None,
        provenance: Optional[str] = None,
    ):
        previous_centroid = self.centroid
        self.box = box
        if person_type is not None:
            self.person_type = person_type
        if is_friendly is not None:
            self.is_friendly = is_friendly
        if uniform_pattern is not None:
            self.uniform_pattern = uniform_pattern
        if provenance is not None:
            self.provenance = provenance
        new_centroid = [box[0] + box[2] / 2.0, box[1] + box[3] / 2.0]
        delta = [new_centroid[0] - previous_centroid[0], new_centroid[1] - previous_centroid[1]]
        # Smooth short-term motion so a track can be matched after a small
        # detection gap without letting one noisy frame move the prediction
        # arbitrarily far.
        self.velocity = [
            self.velocity[0] * 0.6 + delta[0] * 0.4,
            self.velocity[1] * 0.6 + delta[1] * 0.4,
        ]
        self.history.append(new_centroid)
        if len(self.history) > 30:
            self.history.pop(0)

        # Estimate direction vector from last 5 positions
        if len(self.history) >= 3:
            ref_pos = self.history[-min(len(self.history), 5)]
            dx = self.history[-1][0] - ref_pos[0]
            dy = self.history[-1][1] - ref_pos[1]
            if abs(dx) > abs(dy) and abs(dx) > 1.5:
                self.direction = "left_to_right" if dx > 0 else "right_to_left"
            elif abs(dy) > abs(dx) and abs(dy) > 1.5:
                self.direction = "top_to_bottom" if dy > 0 else "bottom_to_top"

        self.centroid = new_centroid
        self.confidence = confidence
        self.last_seen = time.time()
        self.missed_frames = 0
        self.hit_streak += 1
        self.lost_at = None

    @property
    def predicted_centroid(self) -> List[float]:
        """Predict the centroid across a bounded number of missed frames."""
        gap = min(max(self.missed_frames, 0), 5)
        return [
            self.centroid[0] + self.velocity[0] * gap,
            self.centroid[1] + self.velocity[1] * gap,
        ]

    @property
    def dwell_time(self) -> float:
        return time.time() - self.first_seen


class ObjectTracker:
    def __init__(
        self,
        camera_id: str,
        max_missed: Optional[int] = None,
        iou_threshold: Optional[float] = None,
        centroid_distance_threshold: Optional[float] = None,
        recently_lost_ttl: Optional[float] = None,
        max_recently_lost: Optional[int] = None,
        lost_cache_ttl_seconds: Optional[float] = None,
    ):
        self.camera_id = camera_id
        self.max_missed = max(0, int(max_missed if max_missed is not None else TRACKER_MAX_MISSED_FRAMES))
        self.iou_threshold = max(
            0.0,
            min(1.0, float(iou_threshold if iou_threshold is not None else TRACKER_IOU_THRESHOLD))
        )
        self.centroid_distance_threshold = (
            max(0.0, float(centroid_distance_threshold))
            if centroid_distance_threshold is not None
            else None
        )
        self.recently_lost_ttl = max(
            1.0,
            min(
                300.0,
                float(
                    recently_lost_ttl
                    if recently_lost_ttl is not None
                    else (
                        lost_cache_ttl_seconds
                        if lost_cache_ttl_seconds is not None
                        else TRACKER_LOST_TTL_SECONDS
                    )
                ),
            ),
        )
        self.max_recently_lost = max(
            1,
            min(
                4096,
                int(max_recently_lost if max_recently_lost is not None else TRACKER_LOST_MAX_SIZE),
            ),
        )
        self.tracks: Dict[str, Track] = {}
        # Track objects are retained here for a short, bounded re-identification
        # window after their active miss budget expires.  The cache is ordered so
        # the oldest item can be evicted deterministically under load.
        self.recently_lost: "OrderedDict[str, Track]" = OrderedDict()
        self._next_id = 101

    def reset(self) -> None:
        """Reset all active tracks and lost tracks, and reset ID sequence for camera reconnections."""
        self.tracks.clear()
        self.recently_lost.clear()
        self._next_id = 101

    def _cleanup_recently_lost(self, now: float) -> None:
        expired = [
            track_id
            for track_id, track in self.recently_lost.items()
            if track.lost_at is None or (now - track.lost_at) > self.recently_lost_ttl
        ]
        for track_id in expired:
            self.recently_lost.pop(track_id, None)

        while len(self.recently_lost) > self.max_recently_lost:
            self.recently_lost.popitem(last=False)

    def _centroid_gate(self, track: Track, detection_box: List[float]) -> float:
        scale = max(
            math.hypot(max(0.0, track.box[2]), max(0.0, track.box[3])),
            math.hypot(max(0.0, detection_box[2]), max(0.0, detection_box[3])),
            1.0,
        )
        base_gate = self.centroid_distance_threshold or max(5.0, scale * 1.5)
        # Permit a little more travel as the missed gap grows, capped so a
        # stale track cannot absorb an unrelated object.
        return base_gate * (1.0 + min(max(track.missed_frames, 0), 5) * 0.35)

    def _candidate_score(
        self,
        track: Track,
        detection_box: List[float],
        is_reidentification: bool = False,
    ) -> Optional[Tuple[float, float, float]]:
        iou = compute_iou(track.box, detection_box)
        predicted = track.predicted_centroid
        current = _centroid(detection_box)
        distance = math.hypot(predicted[0] - current[0], predicted[1] - current[1])
        gate = self._centroid_gate(track, detection_box)
        # Lower the IoU requirement for an older track, but always retain a
        # centroid gate.  This makes brief occlusions recoverable while
        # preventing arbitrary same-class reassignment.
        gap_factor = min(max(track.missed_frames, 0), 5) / 5.0
        adaptive_iou = max(0.05, self.iou_threshold * (1.0 - 0.55 * gap_factor))
        if iou < adaptive_iou and distance > gate:
            return None
        distance_score = max(0.0, 1.0 - (distance / gate if gate else 1.0))
        score = iou + 0.5 * distance_score
        if is_reidentification:
            # Prefer a live track if both an active and a lost candidate are
            # close, while still allowing a lost track to recover.
            score -= 0.01
        return score, iou, distance

    def _match_active_tracks(
        self,
        active_track_ids: List[str],
        detections: List[Dict],
    ) -> Tuple[set, set]:
        candidates = []
        canonical_boxes = [_detection_box(det) for det in detections]
        for track_id in active_track_ids:
            track = self.tracks[track_id]
            for det_idx, detection in enumerate(detections):
                if detection.get("class_name") != track.class_name:
                    continue
                candidate = self._candidate_score(track, canonical_boxes[det_idx])
                if candidate is not None:
                    candidates.append((candidate[0], track_id, det_idx))

        matched_tracks = set()
        matched_detections = set()
        for _, track_id, det_idx in sorted(candidates, key=lambda item: item[0], reverse=True):
            if track_id in matched_tracks or det_idx in matched_detections:
                continue
            detection = detections[det_idx]
            track = self.tracks[track_id]
            track.update(
                canonical_boxes[det_idx],
                float(detection.get("confidence", 0.0)),
                person_type=detection.get("person_type"),
                is_friendly=detection.get("is_friendly"),
                uniform_pattern=detection.get("uniform_pattern"),
                provenance=detection.get("provenance"),
            )
            matched_tracks.add(track_id)
            matched_detections.add(det_idx)

        for track_id in active_track_ids:
            if track_id not in matched_tracks:
                self.tracks[track_id].missed_frames += 1
        return matched_tracks, matched_detections

    def _reidentify_lost_tracks(
        self,
        detections: List[Dict],
        unmatched_detections: set,
        now: float,
    ) -> set:
        candidates = []
        canonical_boxes = [_detection_box(det) for det in detections]
        for track_id, track in self.recently_lost.items():
            if track.lost_at is None or (now - track.lost_at) > self.recently_lost_ttl:
                continue
            for det_idx in unmatched_detections:
                detection = detections[det_idx]
                if detection.get("class_name") != track.class_name:
                    continue
                candidate = self._candidate_score(track, canonical_boxes[det_idx], is_reidentification=True)
                if candidate is not None:
                    candidates.append((candidate[0], track_id, det_idx))

        matched_lost = set()
        matched_detections = set()
        for _, track_id, det_idx in sorted(candidates, key=lambda item: item[0], reverse=True):
            if track_id in matched_lost or det_idx in matched_detections:
                continue
            track = self.recently_lost.pop(track_id, None)
            if track is None:
                continue
            detection = detections[det_idx]
            track.update(
                canonical_boxes[det_idx],
                float(detection.get("confidence", 0.0)),
                person_type=detection.get("person_type"),
                is_friendly=detection.get("is_friendly"),
                uniform_pattern=detection.get("uniform_pattern"),
                provenance=detection.get("provenance"),
            )
            self.tracks[track_id] = track
            matched_lost.add(track_id)
            matched_detections.add(det_idx)
        return matched_detections

    def update(self, detections: List[Dict]) -> List[Track]:
        """
        detections: list of dicts with keys: 'box' ([x, y, w, h]), 'class_name', 'confidence'
        Returns active matched tracks. Protected by error isolation to prevent crashing the stream.
        """
        try:
            now = time.time()
            self._cleanup_recently_lost(now)
            valid_detections: List[Dict] = []
            for det in detections or []:
                try:
                    box = _detection_box(det)
                except Exception:
                    continue
                if _is_valid_box(box):
                    valid_detections.append(det)

            active_track_ids = list(self.tracks.keys())
            matched_tracks, matched_detections = self._match_active_tracks(active_track_ids, valid_detections)

            # Tracks that outlive their active miss budget are moved to the bounded
            # recently-lost cache before unmatched detections are considered.
            dead_ids = [
                track_id
                for track_id, track in self.tracks.items()
                if track.missed_frames > self.max_missed
            ]
            for track_id in dead_ids:
                track = self.tracks.pop(track_id)
                track.lost_at = now
                self.recently_lost[track_id] = track
                self.recently_lost.move_to_end(track_id)

            # Re-identify a recently lost track before allocating a new ID.
            unmatched_detections = set(range(len(valid_detections))) - matched_detections
            matched_detections.update(self._reidentify_lost_tracks(valid_detections, unmatched_detections, now))

            # Create new tracks for detections that could not be associated with an
            # active or recently-lost track.
            for idx, det in enumerate(valid_detections):
                if idx not in matched_detections:
                    new_id = f"#{self._next_id}"
                    self._next_id += 1
                    self.tracks[new_id] = Track(
                        track_id=new_id,
                        box=_detection_box(det),
                        class_name=det.get("class_name", "object"),
                        confidence=float(det.get("confidence", 0.0)),
                        person_type=det.get("person_type"),
                        is_friendly=det.get("is_friendly", False),
                        uniform_pattern=det.get("uniform_pattern"),
                        provenance=det.get("provenance", "detector"),
                    )

            self._cleanup_recently_lost(now)

            return [trk for trk in self.tracks.values() if trk.missed_frames == 0]
        except Exception as err:
            logger.error("Tracker update failed on camera %s: %s", self.camera_id, err, exc_info=True)
            return [trk for trk in self.tracks.values() if trk.missed_frames == 0]
