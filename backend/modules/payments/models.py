import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, ForeignKey, func
from sqlalchemy.dialects import postgresql as pg
from sqlmodel import SQLModel, Field

from backend.core.types import text_enum
from backend.modules.payments.schemas import (
    PaymentStatus, PendingOperation, CancellationReason,
    WebhookVerificationStatus, WebhookProcessingStatus, ActivationStatus,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


class payments(SQLModel, table=True):
    __tablename__ = "payments"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    order_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, index=True))
    amount_minor: int = Field(sa_column=Column(pg.BIGINT, nullable=False))
    currency: str = Field(default="KZT", sa_column=Column(pg.TEXT, nullable=False, server_default="KZT"))
    status: PaymentStatus = Field(default=PaymentStatus.PENDING, sa_column=Column(text_enum(PaymentStatus), nullable=False))
    pending_operation: PendingOperation | None = Field(default=None, sa_column=Column(text_enum(PendingOperation), nullable=True))
    cancellation_reason: CancellationReason | None = Field(default=None, sa_column=Column(text_enum(CancellationReason), nullable=True))
    provider_invoice_id: str | None = Field(default=None, sa_column=Column(pg.TEXT, unique=True, nullable=True))
    provider_payment_id: str | None = Field(default=None, sa_column=Column(pg.TEXT, unique=True, nullable=True))
    idempotency_key: str = Field(sa_column=Column(pg.TEXT, unique=True, nullable=False))
    next_check_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    check_failure_count: int = Field(default=0, sa_column=Column(pg.INTEGER, nullable=False, server_default="0"))
    processing_fee_minor: int | None = Field(default=None, sa_column=Column(pg.BIGINT, nullable=True))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=_now))
    finalized_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))


class payment_webhook_events(SQLModel, table=True):
    __tablename__ = "payment_webhook_events"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    payment_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("payments.id"), nullable=True))
    provider_invoice_id: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    payload: dict = Field(default_factory=dict, sa_column=Column(pg.JSONB, nullable=False))
    verification_status: WebhookVerificationStatus = Field(default=WebhookVerificationStatus.PENDING, sa_column=Column(text_enum(WebhookVerificationStatus), nullable=False))
    processing_status: WebhookProcessingStatus = Field(default=WebhookProcessingStatus.PENDING, sa_column=Column(text_enum(WebhookProcessingStatus), nullable=False))
    received_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    processed_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))


class paid_sales_activations(SQLModel, table=True):
    __tablename__ = "paid_sales_activations"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id"), unique=True, nullable=False))
    status: ActivationStatus = Field(sa_column=Column(text_enum(ActivationStatus), nullable=False))
