from datetime import datetime, timezone

from sqlalchemy import text
from sqlmodel import Session


def db_now(session: Session) -> datetime:
    return session.execute(text("SELECT clock_timestamp()")).scalar_one()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
