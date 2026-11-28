"""
Seeds the DB with realistic starting data, multi-site tenancy, virtual fence rules, and users.
All seeded alerts are tagged with `provenance='simulation'` per PRD v2.0 FR-4.8
so operators can filter real detector alerts from simulation benchmarks.
"""
from datetime import datetime, timedelta
import os
from sqlalchemy.orm import Session

from . import models
from .security import hash_password, encrypt_field
from .ledger import append_to_ledger

INITIAL_SITES = [
    dict(id="site-alpha", name="Sector North BOP Alpha", region="Northern Frontier", timezone="UTC", retention_days=90),
    dict(id="site-bravo", name="Sector North BOP Bravo", region="Northern Frontier", timezone="UTC", retention_days=90),
]

INITIAL_CAMS = [
    dict(id="cam-1", site_id="site-alpha", name="CAM-01 · Live Camera Feed", location="BOP Alpha — Tactical Sentry",
         online=True, priority="High", fps=15, night=False, scene="fence",
         geo="29.5481°N 74.8763°E", anchor={"left": 44, "top": 46, "w": 12, "h": 26},
         rtsp_url=""),
    dict(id="cam-2", site_id="site-alpha", name="CAM-02 · Perimeter Fixture Stream", location="Perimeter Sector — Fixture Ingest",
         online=True, priority="High", fps=12, night=False, scene="gate",
         geo="29.5502°N 74.8791°E", anchor={"left": 41, "top": 52, "w": 18, "h": 24},
         rtsp_url=""),
]

INITIAL_FENCE_RULES = [
    dict(id="rule-cam1-01", site_id="site-alpha", camera_id="cam-1", name="North Fence Tripwire",
         rule_type="tripwire", direction="bidirectional",
         coordinates=[[10.0, 70.0], [90.0, 70.0]],
         target_classes=["person", "car", "truck", "motorcycle"],
         severity="high", enabled=True, cooldown_seconds=10),
    dict(id="rule-cam2-01", site_id="site-alpha", camera_id="cam-2", name="Gate Entry Zone",
         rule_type="polygon_zone", direction="entry",
         coordinates=[[20.0, 40.0], [80.0, 40.0], [85.0, 90.0], [15.0, 90.0]],
         target_classes=["person", "car", "truck"],
         severity="high", enabled=True, cooldown_seconds=15),
]

TYPE_SEV = {
    "intrusion": "high", "watchlist": "high", "anpr": "med",
    "loiter": "med", "night": "low", "weapon": "high",
}

INITIAL_ALERTS = [
    ("intrusion", "cam-1", 3, "Person crossed north fence line", False, "open"),
    ("watchlist", "cam-2", 9, "Match: Watchlist ID WL-014 (Person of Interest)", False, "open"),
    ("anpr", "cam-2", 14, "Plate PB-11-AK-4471 — flagged vehicle list", False, "open"),
    ("loiter", "cam-2", 21, "Individual stationary 4m+ near border road", True, "acknowledged"),
    ("night", "cam-1", 27, "Movement detected in low-light conditions", True, "resolved"),
    ("intrusion", "cam-2", 35, "Vehicle crossed approach-road boundary", True, "resolved"),
    ("watchlist", "cam-1", 48, "Match: Watchlist ID WL-009 (Person of Interest)", True, "resolved"),
    ("anpr", "cam-2", 55, "Plate RJ-06-CT-1183 — flagged vehicle list", True, "resolved"),
    ("loiter", "cam-2", 72, "Individual stationary 5m+ near gate", True, "resolved"),
    ("night", "cam-1", 95, "Movement detected in low-light conditions", True, "resolved"),
    ("intrusion", "cam-2", 130, "Person crossed gate-road boundary", True, "resolved"),
    ("anpr", "cam-1", 160, "Plate HR-26-BQ-7742 — flagged vehicle list", True, "resolved"),
]

DEMO_USERS = [
    ("admin", os.getenv("IBVAP_DEMO_ADMIN_PASSWORD", "admin123"), "admin"),
    ("supervisor", os.getenv("IBVAP_DEMO_SUPERVISOR_PASSWORD", "supervisor123"), "supervisor"),
    ("operator", os.getenv("IBVAP_DEMO_OPERATOR_PASSWORD", "operator123"), "operator"),
]


def run_seed(db: Session):
    if db.query(models.Site).count() == 0:
        for s in INITIAL_SITES:
            db.add(models.Site(**s))
        db.commit()

    if db.query(models.Camera).count() == 0:
        for c in INITIAL_CAMS:
            db.add(models.Camera(**c))
        db.commit()

    if db.query(models.FenceRule).count() == 0:
        for r in INITIAL_FENCE_RULES:
            db.add(models.FenceRule(**r))
        db.commit()

    seed_demo_alerts = os.getenv("IBVAP_SEED_DEMO_ALERTS", "false").lower() == "true"
    if seed_demo_alerts and db.query(models.Alert).count() == 0:
        seq = 1
        cams_by_id = {c["id"]: c for c in INITIAL_CAMS}
        for type_, cam_id, mins_ago, detail, reviewed, state in INITIAL_ALERTS:
            cam = cams_by_id[cam_id]
            alert_ts = datetime.utcnow() - timedelta(minutes=mins_ago)
            alert = models.Alert(
                id=f"EVT-{seq:04d}",
                site_id=cam.get("site_id", "site-alpha"),
                type=type_,
                sev=TYPE_SEV[type_],
                cam_id=cam_id,
                cam_name=cam["name"],
                location=cam["location"],
                confidence=80 + (seq * 3) % 20,
                track_id=f"#{100 + seq * 7}",
                detail_enc=encrypt_field(detail),
                reviewed=reviewed,
                state=state,
                provenance="simulation",
                model_version="8.2.0",
                rule_id=f"rule-{cam_id}-01",
                rule_version="1.0",
                source_frame_time=alert_ts,
                ts=alert_ts,
                snapshot_enc=None,
            )
            db.add(alert)
            db.commit()
            db.refresh(alert)
            append_to_ledger(db, alert)
            seq += 1

    seed_demo_users = (
        os.getenv("IBVAP_SEED_DEMO_USERS", "true").lower() == "true"
        and os.getenv("IBVAP_ENV", "development").lower() != "production"
    )
    seed_demo_users = (
        os.getenv("IBVAP_SEED_DEMO_USERS", "true").lower() == "true"
        and os.getenv("IBVAP_ENV", "development").lower() != "production"
    )
    if seed_demo_users:
        existing_users = {u.username.lower(): u for u in db.query(models.User).all()}
        changed = False
        for username, password, role in DEMO_USERS:
            existing = existing_users.get(username.lower())
            if not existing:
                db.add(models.User(
                    username=username,
                    email=f"{username}@borderguard.local",
                    hashed_password=hash_password(password),
                    role=role,
                ))
                changed = True
            elif not getattr(existing, "email", None):
                existing.email = f"{username}@borderguard.local"
                changed = True
        if changed:
            db.commit()
