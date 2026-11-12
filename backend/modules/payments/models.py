import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, ForeignKey, CheckConstraint, Index, func, text
from sqlalchemy.dialects import postgresql as pg
from sqlmodel import SQLModel, Field

from backend.modules.payments.schemas import (
    PaymentStatus, PendingOperation, CancellationReason,
    WebhookVerificationStatus, WebhookProcessingStatus, ActivationStatus,
)


PAYMENT_STATE_CHECK = """(
    (status = 'PENDING' AND pending_operation IS NULL AND (cancellation_reason IS NULL OR cancellation_reason IN ('USER_REQUESTED', 'RESERVATION_EXPIRED')))
    OR (status = 'AUTHORIZED' AND pending_operation IS NULL AND cancellation_reason IS NULL)
    OR (status = 'AUTHORIZED' AND pending_operation = 'CANCEL' AND cancellation_reason IS NOT NULL)
    OR (status = 'CAPTURING' AND pending_operation = 'CAPTURE' AND cancellation_reason IS NULL)
    OR (status = 'FAILED' AND pending_operation IS NULL AND (cancellation_reason IS NULL OR cancellation_reason = 'CAPTURE_FAILED'))
    OR (status = 'CANCELLED' AND pending_operation IS NULL AND cancellation_reason IN ('USER_REQUESTED', 'RESERVATION_EXPIRED'))
    OR (status = 'SUCCEEDED' AND pending_operation IS NULL AND cancellation_reason IS NULL)
) IS TRUE"""

PAYMENT_NEXT_CHECK = """(
    (status IN ('PENDING', 'AUTHORIZED', 'CAPTURING') AND next_check_at IS NOT NULL)
    OR (status IN ('SUCCEEDED', 'FAILED', 'CANCELLED') AND next_check_at IS NULL)
) IS TRUE"""

WEBHOOK_STATE_CHECK = """(
    (verification_status = 'PENDING' AND processing_status = 'PENDING')
    OR (verification_status = 'VALID' AND processing_status IN ('PENDING', 'PROCESSED', 'IGNORED'))
    OR (verification_status = 'INVALID' AND processing_status = 'REJECTED')
) IS TRUE"""


class payments(SQLModel, table=True):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint(PAYMENT_STATE_CHECK, name="ck_payments_state"),
        CheckConstraint(PAYMENT_NEXT_CHECK, name="ck_payments_next_check"),
        CheckConstraint("amount_minor > 0", name="ck_payments_amount_positive"),
        CheckConstraint("check_failure_count >= 0", name="ck_payments_check_failure_count"),
        CheckConstraint("processing_fee_minor IS NULL OR processing_fee_minor >= 0", name="ck_payments_fee_non_negative"),
        Index("uq_payments_one_unfinished_per_order", "order_id", unique=True, postgresql_where=text("status IN ('PENDING', 'AUTHORIZED', 'CAPTURING')")),
        Index("ix_payments_due_checks", "next_check_at", postgresql_where=text("status IN ('PENDING', 'AUTHORIZED', 'CAPTURING')")),
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    order_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, index=True))
    provider: str = Field(sa_column=Column(pg.VARCHAR, nullable=False))
    is_simulated: bool = Field(sa_column=Column(pg.BOOLEAN, nullable=False))
    provider_invoice_id: str = Field(sa_column=Column(pg.VARCHAR, unique=True, nullable=False))
    provider_payment_id: str | None = Field(default=None, sa_column=Column(pg.VARCHAR, nullable=True))
    amount_minor: int = Field(sa_column=Column(pg.BIGINT, nullable=False))
    currency: str = Field(default="KZT", sa_column=Column(pg.VARCHAR(3), nullable=False, server_default="KZT"))
    status: PaymentStatus = Field(default=PaymentStatus.PENDING, sa_column=Column(pg.ENUM(PaymentStatus, name="payment_status"), nullable=False))
    pending_operation: PendingOperation | None = Field(default=None, sa_column=Column(pg.ENUM(PendingOperation, name="payment_pending_operation"), nullable=True))
    cancellation_reason: CancellationReason | None = Field(default=None, sa_column=Column(pg.ENUM(CancellationReason, name="payment_cancellation_reason"), nullable=True))
    next_check_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    check_failure_count: int = Field(default=0, sa_column=Column(pg.INTEGER, nullable=False, server_default="0"))
    processing_fee_minor: int | None = Field(default=None, sa_column=Column(pg.BIGINT, nullable=True))
    authorized_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    succeeded_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc)))


class payment_webhook_events(SQLModel, table=True):
    __tablename__ = "payment_webhook_events"
    __table_args__ = (CheckConstraint(WEBHOOK_STATE_CHECK, name="ck_payment_webhook_events_state"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    payment_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("payments.id"), nullable=True, index=True))
    provider_invoice_id: str | None = Field(default=None, sa_column=Column(pg.VARCHAR, nullable=True, index=True))
    payload: dict = Field(sa_column=Column(pg.JSONB, nullable=False))
    verification_status: WebhookVerificationStatus = Field(default=WebhookVerificationStatus.PENDING, sa_column=Column(pg.ENUM(WebhookVerificationStatus, name="webhook_verification_status"), nullable=False))
    processing_status: WebhookProcessingStatus = Field(default=WebhookProcessingStatus.PENDING, sa_column=Column(pg.ENUM(WebhookProcessingStatus, name="webhook_processing_status"), nullable=False))
    received_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    processed_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))


class paid_sales_activations(SQLModel, table=True):
    __tablename__ = "paid_sales_activations"
    __table_args__ = (CheckConstraint("activation_fee_minor >= 0", name="ck_paid_sales_activations_fee"),)
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), primary_key=True))
    status: ActivationStatus = Field(default=ActivationStatus.NOT_REQUESTED, sa_column=Column(pg.ENUM(ActivationStatus, name="paid_sales_activation_status"), nullable=False))
    legal_name: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    payout_details_confirmed: bool = Field(default=False, sa_column=Column(pg.BOOLEAN, nullable=False, server_default="false"))
    activation_fee_minor: int = Field(sa_column=Column(pg.BIGINT, nullable=False))
    fee_paid_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    is_simulated: bool = Field(default=True, sa_column=Column(pg.BOOLEAN, nullable=False, server_default="true"))
    suspended_reason: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    suspended_by_user_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=True))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc)))
