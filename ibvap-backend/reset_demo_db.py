"""
Cleanly resets the local SQLite demo database and re-seeds demo users, sites,
cameras, fence rules, and optional demo alerts for a fresh hackathon pitch.

Usage:
  PYTHONPATH=ibvap-backend IBVAP_SEED_DEMO_USERS=true IBVAP_SEED_DEMO_ALERTS=true ibvap-backend/.venv/bin/python ibvap-backend/reset_demo_db.py
"""
import os
from app.database import Base, SessionLocal, engine, ensure_schema_compatibility
from app import seed


def main() -> None:
    os.environ.setdefault("IBVAP_SEED_DEMO_USERS", "true")
    os.environ.setdefault("IBVAP_SEED_DEMO_ALERTS", "true")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    ensure_schema_compatibility()
    db = SessionLocal()
    try:
        seed.run_seed(db)
        print("Demo database reset and seeded successfully.")
    finally:
        db.close()


if __name__ == "__main__":
    main()

