import os
from datetime import datetime, timezone
from sqlalchemy import create_engine, event, inspect as sqlalchemy_inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

# Prototype uses SQLite for zero-setup local demo. To move to Postgres:
# set DATABASE_URL="postgresql://user:pass@host:5432/ibvap"
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./ibvap.db")

connect_args = {"check_same_thread": False, "timeout": 15} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)

if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.execute("PRAGMA synchronous=NORMAL")
        except Exception:
            pass
        finally:
            cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def utc_now() -> datetime:
    """Returns current UTC datetime as a naive datetime object for SQLite/SQLAlchemy compatibility."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def ensure_schema_compatibility() -> None:
    """Apply small additive migrations needed by existing local databases.

    ``Base.metadata.create_all`` creates new tables but intentionally does not
    alter an existing table.  The command centre keeps a SQLite database for a
    zero-setup local run, so additive columns used by newer releases must be
    upgraded on startup instead of breaking the capture worker.
    """
    with engine.begin() as connection:
        inspector = sqlalchemy_inspect(connection)
        if "alerts" not in inspector.get_table_names():
            return

        alert_columns = {column["name"] for column in inspector.get_columns("alerts")}
        if "event_fingerprint" not in alert_columns:
            connection.execute(text("ALTER TABLE alerts ADD COLUMN event_fingerprint VARCHAR(64)"))

        for col_name, col_sql in [
            ("verification_status", "VARCHAR(32) DEFAULT 'verified_ai'"),
            ("supporting_detections", "INTEGER DEFAULT 1"),
            ("first_detected_at", "DATETIME"),
            ("last_detected_at", "DATETIME"),
            ("secondary_class", "VARCHAR(32)"),
            ("secondary_confidence", "FLOAT"),
        ]:
            if col_name not in alert_columns:
                connection.execute(text(f"ALTER TABLE alerts ADD COLUMN {col_name} {col_sql}"))

        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_alerts_event_fingerprint "
                "ON alerts (event_fingerprint)"
            )
        )
