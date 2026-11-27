"""Site-scoped operational feature flags.

Feature flags are deliberately small and explicit.  They are not a replacement
for governance approval: sensitive capabilities such as face recognition still
require their separate governance workflow.  These flags let an administrator
pause a supported operational module without changing deployment environment
variables or editing the database by hand.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from . import models


FEATURE_FLAG_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "key": "alert_ingestion",
        "label": "Automatic alert ingestion",
        "description": "Persist detector and rule-engine events in the alert feed.",
        "default_enabled": True,
    },
    {
        "key": "watchlist_references",
        "label": "Watchlist references",
        "description": "Allow site-scoped face reference uploads and management.",
        "default_enabled": True,
    },
    {
        "key": "anpr_processing",
        "label": "ANPR processing",
        "description": "Allow ANPR events to be ingested by the alert API.",
        "default_enabled": True,
    },
    {
        "key": "tactical_recommendations",
        "label": "Tactical recommendations",
        "description": "Generate advisory terrain and response recommendations for alerts.",
        "default_enabled": True,
    },
]

FEATURE_FLAG_KEYS = {definition["key"] for definition in FEATURE_FLAG_DEFINITIONS}


def get_definition(key: str) -> Optional[Dict[str, Any]]:
    return next((item for item in FEATURE_FLAG_DEFINITIONS if item["key"] == key), None)


def is_enabled(db: Session, site_id: str, key: str) -> bool:
    """Return the persisted value, or the safe product default if unset."""
    definition = get_definition(key)
    if definition is None:
        return False
    flag = db.query(models.FeatureFlag).filter(
        models.FeatureFlag.site_id == site_id,
        models.FeatureFlag.key == key,
    ).first()
    return bool(flag.enabled) if flag is not None else bool(definition["default_enabled"])


def list_effective(db: Session, site_id: str) -> List[Dict[str, Any]]:
    persisted = {
        flag.key: flag
        for flag in db.query(models.FeatureFlag).filter(models.FeatureFlag.site_id == site_id).all()
    }
    result: List[Dict[str, Any]] = []
    for definition in FEATURE_FLAG_DEFINITIONS:
        flag = persisted.get(definition["key"])
        result.append({
            **definition,
            "enabled": bool(flag.enabled) if flag is not None else bool(definition["default_enabled"]),
            "persisted": flag is not None,
            "updated_by": flag.updated_by if flag is not None else None,
            "updated_at": flag.updated_at if flag is not None else None,
        })
    return result


def set_enabled(db: Session, site_id: str, key: str, enabled: bool, updated_by: str) -> models.FeatureFlag:
    """Create or update one site flag.  Callers validate the key first."""
    flag = db.query(models.FeatureFlag).filter(
        models.FeatureFlag.site_id == site_id,
        models.FeatureFlag.key == key,
    ).first()
    now = datetime.utcnow()
    if flag is None:
        flag = models.FeatureFlag(
            id=f"FF-{site_id}-{key}",
            site_id=site_id,
            key=key,
            enabled=enabled,
            updated_by=updated_by,
            created_at=now,
            updated_at=now,
        )
        db.add(flag)
    else:
        flag.enabled = enabled
        flag.updated_by = updated_by
        flag.updated_at = now
    db.commit()
    db.refresh(flag)
    return flag
