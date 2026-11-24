import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects import postgresql as pg
from sqlmodel import SQLModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class outbox_events(SQLModel, table=True):
    __tablename__ = "outbox_events"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    business_event_key: str = Field(sa_column=Column(pg.TEXT, unique=True, nullable=False))
    aggregate_type: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    aggregate_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), nullable=False))
    event_type: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    payload: dict = Field(default_factory=dict, sa_column=Column(pg.JSONB, nullable=False))
    status: str = Field(default="PENDING", sa_column=Column(pg.TEXT, nullable=False, server_default="PENDING"))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    processing_until: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    processed_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    last_error_code: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    fanout_cursor_user_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=True))
    fanout_cutoff_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))


class notifications(SQLModel, table=True):
    __tablename__ = "notifications"
    __table_args__ = (UniqueConstraint("outbox_event_id", "user_id"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    outbox_event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("outbox_events.id"), nullable=False))
    user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True))
    type: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    title: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    body: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    action_url: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    read_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))


class notification_deliveries(SQLModel, table=True):
    __tablename__ = "notification_deliveries"
    __table_args__ = (UniqueConstraint("outbox_event_id", "recipient_email", "purpose_key"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    outbox_event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("outbox_events.id"), nullable=False, index=True))
    recipient_user_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=True))
    recipient_email: str = Field(sa_column=Column(pg.CITEXT, nullable=False))
    purpose_key: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    template_key: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    template_version: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    locale: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    template_data: dict = Field(default_factory=dict, sa_column=Column(pg.JSONB, nullable=False))
    encrypted_secret_payload: bytes | None = Field(default=None, sa_column=Column(pg.BYTEA, nullable=True))
    secret_key_version: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    invitation_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("private_event_invitations.id"), nullable=True))
    status: str = Field(default="PENDING", sa_column=Column(pg.TEXT, nullable=False, server_default="PENDING"))
    attempt_count: int = Field(default=0, sa_column=Column(pg.INTEGER, nullable=False, server_default="0"))
    next_attempt_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    processing_until: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    provider_message_id: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    sent_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    skipped_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    skip_reason: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    last_error_code: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
