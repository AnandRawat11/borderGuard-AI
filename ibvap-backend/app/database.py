import os
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, event, inspect as sqlalchemy_inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

_BACKEND_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
if _BACKEND_ENV_PATH.exists():
    load_dotenv(_BACKEND_ENV_PATH, override=False)


def _normalize_database_url(raw_url: str) -> str:
    url = (raw_url or "").strip()
    if not url:
        return "sqlite:///./ibvap.db"
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql") and "://" in url:
        scheme, rest = url.split("://", 1)
        if "/" in rest:
            authority, tail = rest.split("/", 1)
            path_part = "/" + tail
        else:
            authority, path_part = rest, ""
        if "@" in authority:
            userinfo, hostport = authority.rsplit("@", 1)
            if ":" in userinfo:
                user, password = userinfo.split(":", 1)
                if "@" in password:
                    password = password.replace("@", "%40")
                userinfo = f"{user}:{password}"
            authority = f"{userinfo}@{hostport}"
        if (".supabase.co" in authority.lower() or ".pooler.supabase.com" in authority.lower()) and "sslmode=" not in path_part.lower():
            sep = "&" if "?" in path_part else "?"
            path_part = f"{path_part}{sep}sslmode=require"
        url = f"{scheme}://{authority}{path_part}"
    return url


# Prototype uses SQLite for zero-setup local demo. To move to Postgres:
# set DATABASE_URL="postgresql://user:pass@host:5432/ibvap"
DATABASE_URL = _normalize_database_url(os.getenv("DATABASE_URL", "sqlite:///./ibvap.db"))

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 15})
else:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"connect_timeout": 10},
        pool_pre_ping=True,
        pool_recycle=300,
    )

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
        table_names = set(inspector.get_table_names())
        timestamp_type = "TIMESTAMP" if connection.dialect.name == "postgresql" else "DATETIME"

        if "users" in table_names:
            user_columns = {column["name"] for column in inspector.get_columns("users")}
            if "email" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR(255)"))
                connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)"))

        if "alerts" not in table_names:
            return

        alert_columns = {column["name"] for column in inspector.get_columns("alerts")}
        if "event_fingerprint" not in alert_columns:
            connection.execute(text("ALTER TABLE alerts ADD COLUMN event_fingerprint VARCHAR(64)"))

        for col_name, col_sql in [
            ("verification_status", "VARCHAR(32) DEFAULT 'verified_ai'"),
            ("supporting_detections", "INTEGER DEFAULT 1"),
            ("first_detected_at", timestamp_type),
            ("last_detected_at", timestamp_type),
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
