import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, ForeignKey, Identity, UniqueConstraint, func
from sqlalchemy.dialects import postgresql as pg
from sqlmodel import SQLModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class support_cases(SQLModel, table=True):
    __tablename__ = "support_cases"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    case_number: int | None = Field(default=None, sa_column=Column(pg.BIGINT, Identity(start=1001), unique=True, nullable=False))
    requester_user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True))
    case_scope: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    event_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id"), nullable=True, index=True))
    order_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("orders.id"), nullable=True))
    ticket_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("tickets.id"), nullable=True))
    previous_case_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("support_cases.id"), nullable=True))
    category: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    custom_subject: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    status: str = Field(default="OPEN", sa_column=Column(pg.TEXT, nullable=False, server_default="OPEN"))
    assigned_to_user_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=True))
    escalated_to_platform: bool = Field(default=False, sa_column=Column(pg.BOOLEAN, nullable=False, server_default="false"))
    resolved_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    last_message_seq: int = Field(default=0, sa_column=Column(pg.BIGINT, nullable=False, server_default="0"))
    requester_last_read_seq: int = Field(default=0, sa_column=Column(pg.BIGINT, nullable=False, server_default="0"))
    support_last_read_seq: int = Field(default=0, sa_column=Column(pg.BIGINT, nullable=False, server_default="0"))
    requester_unread_notified: bool = Field(default=False, sa_column=Column(pg.BOOLEAN, nullable=False, server_default="false"))
    support_unread_notified: bool = Field(default=False, sa_column=Column(pg.BOOLEAN, nullable=False, server_default="false"))
    requester_notice_generation: int = Field(default=0, sa_column=Column(pg.BIGINT, nullable=False, server_default="0"))
    support_notice_generation: int = Field(default=0, sa_column=Column(pg.BIGINT, nullable=False, server_default="0"))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=_now))


class support_messages(SQLModel, table=True):
    __tablename__ = "support_messages"
    __table_args__ = (UniqueConstraint("support_case_id", "message_seq"), UniqueConstraint("support_case_id", "sender_user_id", "client_message_id"))
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    support_case_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("support_cases.id"), nullable=False, index=True))
    message_seq: int = Field(sa_column=Column(pg.BIGINT, nullable=False))
    sender_user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=False))
    client_message_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), nullable=False))
    body: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))


class support_case_history(SQLModel, table=True):
    __tablename__ = "support_case_history"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    support_case_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("support_cases.id"), nullable=False, index=True))
    actor_user_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=True))
    action: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    old_status: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    new_status: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    old_assignee_user_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=True))
    new_assignee_user_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=True))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    details: dict | None = Field(default=None, sa_column=Column("metadata", pg.JSONB(none_as_null=True), nullable=True))
