import uuid
from datetime import datetime

from sqlalchemy import DateTime
from sqlalchemy.dialects.postgresql import CITEXT
from sqlmodel import Field, SQLModel

from core.timeutils import utcnow


class PendingRegistration(SQLModel, table=True):
    __tablename__ = "pending_registrations"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(sa_type=CITEXT, unique=True)
    password_hash: str
    full_name: str
    phone: str = Field(max_length=16)
    locale: str = Field(default="ru", max_length=10)
    verification_hash: str = Field(unique=True)
    expires_at: datetime = Field(sa_type=DateTime(timezone=True))
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
    updated_at: datetime = Field(
        default_factory=utcnow, sa_type=DateTime(timezone=True), sa_column_kwargs={"onupdate": utcnow}
    )


class RefreshSession(SQLModel, table=True):
    __tablename__ = "refresh_sessions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, ondelete="CASCADE")
    refresh_token_hash: str = Field(unique=True)
    expires_at: datetime = Field(sa_type=DateTime(timezone=True))
    revoked_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))


class PasswordResetToken(SQLModel, table=True):
    __tablename__ = "password_reset_tokens"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, ondelete="CASCADE")
    token_hash: str = Field(unique=True)
    expires_at: datetime = Field(sa_type=DateTime(timezone=True))
    used_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    revoked_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
