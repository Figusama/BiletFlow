import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy import Column, ForeignKey, func
from sqlalchemy.dialects import postgresql as pg
from sqlmodel import SQLModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class refund_requests(SQLModel, table=True):
    __tablename__ = "refund_requests"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    order_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, index=True))
    requested_by_user_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=True))
    source: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    status: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    execution_status: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    execution_finalized_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    event_change_request_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("event_change_requests.id"), nullable=True))
    reason_code: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    comment: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    reviewed_by_user_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=True))
    reviewed_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=_now))


class refunds(SQLModel, table=True):
    __tablename__ = "refunds"
    __table_args__ = (
        sa.Index("ux_refund_success_per_order", "order_id", unique=True, postgresql_where=sa.text("status = 'SUCCEEDED'")),
        sa.Index("ux_refund_unfinished_per_order", "order_id", unique=True, postgresql_where=sa.text("status IN ('PENDING','PROCESSING','UNKNOWN')")),
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    refund_request_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("refund_requests.id"), nullable=False, index=True))
    order_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False))
    payment_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("payments.id"), nullable=False))
    amount_minor: int = Field(sa_column=Column(pg.BIGINT, nullable=False))
    status: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    attempt_actor: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    provider_ref: str | None = Field(default=None, sa_column=Column(pg.TEXT, unique=True, nullable=True))
    idempotency_key: str = Field(sa_column=Column(pg.TEXT, unique=True, nullable=False))
    next_retry_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    next_check_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=_now))
    finalized_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
