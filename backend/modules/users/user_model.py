import sqlalchemy.dialects.postgresql as pg
from datetime import datetime, timezone
import uuid
from sqlmodel import SQLModel, Field, Column
from enum import Enum
import sqlalchemy as sa
import secrets

from backend.core.types import text_enum


class Role(str, Enum):
    USER = "USER"
    PLATFORM_ADMIN = "PLATFORM_ADMIN"


class EventRole(str, Enum):
    ORGANIZER = "ORGANIZER"
    EVENT_ADMIN = "EVENT_ADMIN"
    EVENT_SUPPORT = "EVENT_SUPPORT"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class users(SQLModel, table=True):
    __tablename__ = "users"

    id : uuid.UUID = Field(
        sa_column=Column(pg.UUID(as_uuid=True), nullable=False, primary_key=True, default=uuid.uuid4, server_default=sa.func.gen_random_uuid())
    )

    public_id : str = Field(
        sa_column=Column(sa.String, default=lambda: secrets.token_urlsafe(8), unique=True, nullable=False, index=True)
    )
    email : str = Field(sa_column=Column(pg.CITEXT, unique=True, nullable=False))
    password_hash : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    personal_role : Role = Field(default=Role.USER, sa_column=Column(text_enum(Role), nullable=False, server_default=Role.USER.value))
    is_suspended : bool = Field(default=False, sa_column=Column(pg.BOOLEAN, nullable=False, server_default=sa.false()))
    created_at : datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()))
    updated_at : datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=_now))


class profiles(SQLModel, table=True):
    __tablename__ = "profiles"

    user_id : uuid.UUID = Field(
        sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), primary_key=True, nullable=False)
    )
    full_name : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    phone : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    avatar_url : str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    locale : str = Field(default="ru", sa_column=Column(pg.TEXT, nullable=False, server_default="ru"))
    created_at : datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()))
    updated_at : datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=_now))

class pending_registrations(SQLModel, table=True):
    __tablename__ = "pending_registrations"

    id : uuid.UUID = Field(
        sa_column=Column(pg.UUID(as_uuid=True), nullable=False, primary_key=True, default=uuid.uuid4, server_default=sa.func.gen_random_uuid())
    )
    email : str = Field(sa_column=Column(pg.CITEXT, unique=True, nullable=False))
    password_hash : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    full_name : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    phone : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    verification_hash : str = Field(sa_column=Column(pg.TEXT, unique=True, nullable=False))
    expires_at : datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    created_at : datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()))
    updated_at : datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=_now))

class event_user_roles(SQLModel, table=True):
    __tablename__ = "event_user_roles"
    __table_args__ = (sa.Index("ux_one_organizer_per_event", "event_id", unique=True, postgresql_where=sa.text("event_role = 'ORGANIZER'")),)

    event_id : uuid.UUID = Field(
            sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("events.id"), primary_key=True, nullable=False)
        )
    user_id : uuid.UUID = Field(
            sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), primary_key=True, nullable=False)
        )
    event_role : EventRole = Field(sa_column=Column(text_enum(EventRole), primary_key=True, nullable=False))
    created_at : datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()))

class refresh_sessions(SQLModel, table=True):
    __tablename__ = "refresh_sessions"

    id : uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=sa.func.gen_random_uuid()))
    user_id : uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True))
    refresh_token_hash : str = Field(sa_column=Column(pg.TEXT, unique=True, nullable=False))
    expires_at : datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    revoked_at : datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    created_at : datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()))

class password_reset_tokens(SQLModel, table=True):
    __tablename__ = "password_reset_tokens"

    id : uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=sa.func.gen_random_uuid()))
    user_id : uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True))
    token_hash : str = Field(sa_column=Column(pg.TEXT, unique=True, nullable=False))
    expires_at : datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    used_at : datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    revoked_at : datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    created_at : datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()))
