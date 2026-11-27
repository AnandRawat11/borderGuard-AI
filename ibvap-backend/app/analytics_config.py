"""
Centralized Configuration for IBVAP Analytics, Tracking, and Verification Pipeline.
Provides configurable parameters for:
- Object tracking (IoU, gates, miss budgets, re-identification TTL)
- Event state deduplication and cooldowns
- Temporal weapon detection verification (rolling window, count, confidence thresholds)
- Optional secondary weapon classification interface
"""
import os
from typing import Optional


def _get_env_float(name: str, default: float, min_val: float = 0.0, max_val: float = 3600.0) -> float:
    try:
        val = float(os.getenv(name, str(default)))
        return max(min_val, min(max_val, val))
    except (TypeError, ValueError):
        return default


def _get_env_int(name: str, default: int, min_val: int = 1, max_val: int = 100_000) -> int:
    try:
        val = int(os.getenv(name, str(default)))
        return max(min_val, min(max_val, val))
    except (TypeError, ValueError):
        return default


def _get_env_bool(name: str, default: bool) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


# ==============================================================================
# FEATURE 1: Object Tracker Settings
# ==============================================================================
TRACKER_MAX_MISSED_FRAMES: int = _get_env_int("IBVAP_TRACKER_MAX_MISSED", 10, min_val=1, max_val=120)
TRACKER_IOU_THRESHOLD: float = _get_env_float("IBVAP_TRACKER_IOU_THRESH", 0.25, min_val=0.01, max_val=1.0)
TRACKER_CENTROID_GATE: Optional[float] = None
TRACKER_LOST_TTL_SECONDS: float = _get_env_float("IBVAP_TRACKER_LOST_TTL_SECONDS", 15.0, min_val=1.0, max_val=300.0)
TRACKER_LOST_MAX_SIZE: int = _get_env_int("IBVAP_TRACKER_LOST_MAX_SIZE", 256, min_val=16, max_val=4096)


# ==============================================================================
# FEATURE 2: Alert Deduplication & Cooldown Settings
# ==============================================================================
# Configurable cooldown between distinct occurrences of an event for the same track
ALERT_COOLDOWN_SECONDS: float = _get_env_float("IBVAP_ALERT_COOLDOWN_SECONDS", 30.0, min_val=1.0, max_val=3600.0)
EVENT_DEDUP_SPATIAL_BUCKET_SIZE: float = _get_env_float("IBVAP_EVENT_DEDUP_SPATIAL_BUCKET", 10.0, min_val=1.0, max_val=100.0)
EVENT_DEDUP_TIME_BUCKET_SECONDS: float = _get_env_float("IBVAP_EVENT_DEDUP_TIME_BUCKET", 5.0, min_val=1.0, max_val=300.0)
EVENT_DEDUP_MAX_ENTRIES: int = _get_env_int("IBVAP_EVENT_DEDUP_MAX_ENTRIES", 10000, min_val=128, max_val=100_000)


# ==============================================================================
# FEATURE 3: Temporal Weapon Verification Settings
# ==============================================================================
# Rolling time window in seconds during which weapon evidence must be accumulated
WEAPON_VERIFICATION_WINDOW_SECONDS: float = _get_env_float(
    "IBVAP_WEAPON_VERIFICATION_WINDOW_SECONDS", 2.0, min_val=0.5, max_val=15.0
)

# Minimum number of high-confidence detections required in the rolling window
WEAPON_MIN_DETECTIONS: int = _get_env_int(
    "IBVAP_WEAPON_MIN_DETECTIONS", 3, min_val=1, max_val=30
)

# Minimum confidence required for a detection to count toward verified status
WEAPON_MIN_CONFIDENCE: float = _get_env_float(
    "IBVAP_WEAPON_MIN_CONFIDENCE", 0.60, min_val=0.10, max_val=0.99
)

# Minimum confidence to track as a candidate / potential weapon (below this is discarded as noise)
WEAPON_POTENTIAL_THRESHOLD: float = _get_env_float(
    "IBVAP_WEAPON_POTENTIAL_THRESHOLD", 0.35, min_val=0.10, max_val=0.90
)

# Cooldown between verified weapon alerts for the same track (seconds)
WEAPON_ALERT_COOLDOWN_SECONDS: float = _get_env_float(
    "IBVAP_WEAPON_ALERT_COOLDOWN_SECONDS", 60.0, min_val=5.0, max_val=600.0
)

# Track weapon history retention in memory (seconds)
WEAPON_HISTORY_RETENTION_SECONDS: float = _get_env_float(
    "IBVAP_WEAPON_HISTORY_RETENTION_SECONDS", 15.0, min_val=3.0, max_val=300.0
)


# ==============================================================================
# FEATURE 4: Optional Secondary Weapon Classifier Settings
# ==============================================================================
SECONDARY_CLASSIFIER_ENABLED: bool = _get_env_bool("IBVAP_SECONDARY_CLASSIFIER_ENABLED", False)
SECONDARY_CLASSIFIER_MODEL_PATH: Optional[str] = os.getenv("IBVAP_SECONDARY_CLASSIFIER_MODEL_PATH")
SECONDARY_CLASSIFIER_UNCERTAINTY_THRESHOLD: float = _get_env_float(
    "IBVAP_SECONDARY_CLASSIFIER_UNCERTAINTY_THRESHOLD", 0.50, min_val=0.10, max_val=0.95
)
