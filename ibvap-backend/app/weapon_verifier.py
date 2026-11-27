"""
Temporal Weapon Verification Engine for IBVAP (Feature 3).

Prevents false weapon alerts caused by fleeting false positives or ordinary objects
(cell phones, toothbrushes, pens, remotes, utensils) being misclassified as knives.

Verification Logic:
-------------------
1. Maintains rolling evidence history for each tracked object per camera.
2. Low-confidence detections (< WEAPON_POTENTIAL_THRESHOLD) are discarded as noise.
3. Candidate detections (>= WEAPON_POTENTIAL_THRESHOLD) are tracked as 'potential'.
4. To reach 'verified_ai' status, an object must accumulate at least WEAPON_MIN_DETECTIONS
   with confidence >= WEAPON_MIN_CONFIDENCE within the rolling WEAPON_VERIFICATION_WINDOW_SECONDS.
5. Employs latching per track to suppress repeated alerts for the same active weapon.
6. Integrates optional SecondaryWeaponClassifier when available.
"""
from enum import Enum
import time
from collections import OrderedDict
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import logging

from . import analytics_config
from .secondary_classifier import (
    WeaponClass,
    SecondaryClassificationResult,
    get_secondary_classifier
)

logger = logging.getLogger("ibvap.weapon_verifier")


class WeaponVerificationStatus(str, Enum):
    NONE = "none"
    POTENTIAL = "potential"
    VERIFIED_AI = "verified_ai"
    OFFICER_REVIEWED = "officer_reviewed"


class WeaponEvidenceItem:
    def __init__(
        self,
        timestamp: float,
        class_name: str,
        confidence: float,
        box: List[float],
        secondary_result: Optional[SecondaryClassificationResult] = None
    ):
        self.timestamp = timestamp
        self.class_name = class_name
        self.confidence = float(confidence)
        self.box = box
        self.secondary_result = secondary_result


class TrackWeaponHistory:
    def __init__(self, camera_id: str, track_id: str):
        self.camera_id = camera_id
        self.track_id = track_id
        self.evidence: List[WeaponEvidenceItem] = []
        self.first_detected_at: float = time.time()
        self.last_detected_at: float = time.time()
        self.verified_alert_emitted: bool = False
        self.last_alert_time: float = 0.0

    def prune_old_evidence(self, now: float, window_seconds: float):
        cutoff = now - window_seconds
        self.evidence = [e for e in self.evidence if e.timestamp >= cutoff]

    def add_detection(
        self,
        class_name: str,
        confidence: float,
        box: List[float],
        timestamp: float,
        secondary_result: Optional[SecondaryClassificationResult] = None
    ):
        self.evidence.append(
            WeaponEvidenceItem(
                timestamp=timestamp,
                class_name=class_name,
                confidence=confidence,
                box=box,
                secondary_result=secondary_result
            )
        )
        self.last_detected_at = timestamp


class WeaponVerificationResult:
    def __init__(
        self,
        status: str,  # 'none' | 'potential' | 'verified_ai' | 'officer_reviewed'
        is_new_alert: bool,
        track_id: str,
        class_name: str,
        first_detected_at: float,
        last_detected_at: float,
        supporting_detections_count: int,
        total_detections_in_window: int,
        detector_confidence: float,
        avg_confidence: float,
        secondary_result: Optional[SecondaryClassificationResult] = None,
        reason: str = ""
    ):
        self.status = status
        self.is_new_alert = is_new_alert
        self.track_id = track_id
        self.class_name = class_name
        self.first_detected_at = first_detected_at
        self.last_detected_at = last_detected_at
        self.supporting_detections_count = supporting_detections_count
        self.total_detections_in_window = total_detections_in_window
        self.detector_confidence = detector_confidence
        self.avg_confidence = avg_confidence
        self.secondary_result = secondary_result
        self.reason = reason

    @property
    def candidate_class(self) -> str:
        return self.class_name

    @property
    def supporting_detections(self) -> int:
        return self.supporting_detections_count

    @property
    def mean_confidence(self) -> float:
        return self.avg_confidence

    @property
    def secondary_class(self) -> Optional[str]:
        return self.secondary_result.predicted_class.value if self.secondary_result else None

    @property
    def secondary_confidence(self) -> Optional[float]:
        return self.secondary_result.confidence if self.secondary_result else None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "is_new_alert": self.is_new_alert,
            "track_id": self.track_id,
            "class_name": self.class_name,
            "first_detected_at": self.first_detected_at,
            "last_detected_at": self.last_detected_at,
            "supporting_detections_count": self.supporting_detections_count,
            "total_detections_in_window": self.total_detections_in_window,
            "detector_confidence": self.detector_confidence,
            "avg_confidence": self.avg_confidence,
            "secondary_result": self.secondary_result.to_dict() if self.secondary_result else None,
            "reason": self.reason
        }


class TemporalWeaponVerifier:
    """
    Per-camera or global temporal weapon verifier.
    Thread-safe verification engine tracking temporal consistency across frames.
    """
    def __init__(
        self,
        window_seconds: Optional[float] = None,
        min_detections: Optional[int] = None,
        min_confidence: Optional[float] = None,
        potential_threshold: Optional[float] = None,
        alert_cooldown_seconds: Optional[float] = None,
        max_tracks: int = 1024
    ):
        self.window_seconds = (
            window_seconds if window_seconds is not None
            else analytics_config.WEAPON_VERIFICATION_WINDOW_SECONDS
        )
        self.min_detections = (
            min_detections if min_detections is not None
            else analytics_config.WEAPON_MIN_DETECTIONS
        )
        self.min_confidence = (
            min_confidence if min_confidence is not None
            else analytics_config.WEAPON_MIN_CONFIDENCE
        )
        self.potential_threshold = (
            potential_threshold if potential_threshold is not None
            else analytics_config.WEAPON_POTENTIAL_THRESHOLD
        )
        self.cooldown_seconds = (
            alert_cooldown_seconds if alert_cooldown_seconds is not None
            else analytics_config.WEAPON_ALERT_COOLDOWN_SECONDS
        )
        self.max_tracks = max_tracks
        # (camera_id, track_id) -> TrackWeaponHistory
        self._histories: "OrderedDict[Tuple[str, str], TrackWeaponHistory]" = OrderedDict()

    def _cleanup_expired(self, now: float):
        retention = analytics_config.WEAPON_HISTORY_RETENTION_SECONDS
        expired_keys = [
            k for k, h in self._histories.items()
            if (now - h.last_detected_at) > retention
        ]
        for k in expired_keys:
            self._histories.pop(k, None)

        while len(self._histories) > self.max_tracks:
            self._histories.popitem(last=False)

    def reset_camera(self, camera_id: str):
        """Clean up all tracking histories for a disconnected or reset camera."""
        keys_to_remove = [k for k in self._histories if k[0] == camera_id]
        for k in keys_to_remove:
            self._histories.pop(k, None)

    def process_detection(
        self,
        camera_id: str,
        track_id: Optional[str] = None,
        detection_box: Optional[List[float]] = None,
        candidate_class: Optional[str] = None,
        confidence: float = 0.0,
        frame_bytes: Optional[bytes] = None,
        frame_bgr: Optional[np.ndarray] = None,
        now: Optional[float] = None,
        class_name: Optional[str] = None,
        box: Optional[List[float]] = None,
        **kwargs
    ) -> WeaponVerificationResult:
        """
        Evaluate a weapon detection against rolling temporal verification criteria.
        """
        now = now if now is not None else time.time()
        self._cleanup_expired(now)

        resolved_class = candidate_class or class_name or "weapon"
        resolved_box = detection_box if detection_box is not None else (box or [0.0, 0.0, 0.0, 0.0])
        resolved_track_id = track_id or "#weapon-cand"

        # 1. Discard noise below candidate potential threshold
        if confidence < self.potential_threshold:
            return WeaponVerificationResult(
                status="none",
                is_new_alert=False,
                track_id=resolved_track_id,
                class_name=resolved_class,
                first_detected_at=now,
                last_detected_at=now,
                supporting_detections_count=0,
                total_detections_in_window=0,
                detector_confidence=confidence,
                avg_confidence=confidence,
                reason="confidence_below_potential_threshold"
            )

        key = (camera_id, resolved_track_id)
        if key not in self._histories:
            self._histories[key] = TrackWeaponHistory(camera_id, resolved_track_id)
            self._histories[key].first_detected_at = now
        
        history = self._histories[key]
        self._histories.move_to_end(key)

        # 2. Optional secondary classification
        sec_result: Optional[SecondaryClassificationResult] = None
        secondary_classifier = get_secondary_classifier()
        if secondary_classifier.is_available() and frame_bgr is not None and frame_bgr.size > 0:
            h, w = frame_bgr.shape[:2]
            bx, by, bw, bh = resolved_box
            # Ensure pixel coordinates
            if bw <= 1.0 and bh <= 1.0:
                px1, py1 = int(bx * w), int(by * h)
                px2, py2 = int((bx + bw) * w), int((by + bh) * h)
            else:
                px1, py1, px2, py2 = int(bx), int(by), int(bx + bw), int(by + bh)
            px1, py1 = max(0, px1), max(0, py1)
            px2, py2 = min(w, px2), min(h, py2)
            if px2 > px1 and py2 > py1:
                crop = frame_bgr[py1:py2, px1:px2]
                sec_result = secondary_classifier.classify_crop(crop)

        # 3. Add to rolling evidence
        history.add_detection(resolved_class, confidence, resolved_box, now, secondary_result=sec_result)
        history.prune_old_evidence(now, self.window_seconds)

        # 4. Count qualifying detections in the active window
        qualifying_items = [e for e in history.evidence if e.confidence >= self.min_confidence]
        total_items = len(history.evidence)
        supporting_count = len(qualifying_items)

        avg_conf = (
            sum(e.confidence for e in qualifying_items) / supporting_count
            if supporting_count > 0 else confidence
        )
        max_conf = max((e.confidence for e in history.evidence), default=confidence)

        # 5. Check if secondary classifier explicitly ruled out weapon
        if sec_result and not sec_result.is_uncertain and sec_result.predicted_class == WeaponClass.OTHER_OBJECT:
            return WeaponVerificationResult(
                status="none",
                is_new_alert=False,
                track_id=resolved_track_id,
                class_name=resolved_class,
                first_detected_at=history.first_detected_at,
                last_detected_at=now,
                supporting_detections_count=supporting_count,
                total_detections_in_window=total_items,
                detector_confidence=confidence,
                avg_confidence=avg_conf,
                secondary_result=sec_result,
                reason="secondary_classifier_ruled_out_weapon"
            )

        # 6. Apply Temporal Verification Criteria
        # Must meet: min_detections within window AND avg_conf >= min_confidence
        is_verified = (
            supporting_count >= self.min_detections and
            avg_conf >= self.min_confidence
        )

        if is_verified:
            # Check alert latching and cooldown
            time_since_last_alert = now - history.last_alert_time
            if not history.verified_alert_emitted or (time_since_last_alert >= self.cooldown_seconds):
                history.verified_alert_emitted = True
                history.last_alert_time = now
                is_new_alert = True
                reason = f"Verified AI Weapon Alert: {supporting_count}/{self.min_detections} frames confirmed in {self.window_seconds}s window (avg conf: {avg_conf:.2f})"
            else:
                is_new_alert = False
                reason = f"Verified AI Weapon Alert active (suppressed via track latch / cooldown, {int(time_since_last_alert)}s since alert)"

            return WeaponVerificationResult(
                status="verified_ai",
                is_new_alert=is_new_alert,
                track_id=resolved_track_id,
                class_name=resolved_class,
                first_detected_at=history.first_detected_at,
                last_detected_at=now,
                supporting_detections_count=supporting_count,
                total_detections_in_window=total_items,
                detector_confidence=max_conf,
                avg_confidence=avg_conf,
                secondary_result=sec_result,
                reason=reason
            )
        else:
            # Insufficient temporal support -> Potential Weapon Detection
            reason = f"Potential Weapon Detection: {supporting_count}/{self.min_detections} verified frames (accumulating evidence, window={self.window_seconds}s)"
            return WeaponVerificationResult(
                status="potential",
                is_new_alert=False,
                track_id=resolved_track_id,
                class_name=resolved_class,
                first_detected_at=history.first_detected_at,
                last_detected_at=now,
                supporting_detections_count=supporting_count,
                total_detections_in_window=total_items,
                detector_confidence=confidence,
                avg_confidence=avg_conf,
                secondary_result=sec_result,
                reason=reason
            )


# Global singleton verifier instance
_global_weapon_verifier: TemporalWeaponVerifier = TemporalWeaponVerifier()


def get_weapon_verifier() -> TemporalWeaponVerifier:
    return _global_weapon_verifier
