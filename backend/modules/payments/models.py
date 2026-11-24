import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, Column, ForeignKey, Index, func, text
from sqlalchemy.dialects import postgresql as pg
from sqlmodel import SQLModel, Field

from backend.core.types import text_enum
from backend.modules.payments.schemas import (
    PaymentStatus, PendingOperation, CancellationReason,
    WebhookVerificationStatus, WebhookProcessingStatus, ActivationStatus,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


PAYMENT_STATE_CHECK = """((status = 'PENDING' AND pending_operation IS NULL AND (cancellation_reason IS NULL OR cancellation_reason IN ('USER_REQUESTED','RESERVATION_EXPIRED')))
    OR (status = 'AUTHORIZED' AND ((pending_operation IS NULL AND cancellation_reason IS NULL) OR (pending_operation = 'CANCEL' AND cancellation_reason IN ('USER_REQUESTED','RESERVATION_EXPIRED','CAPTURE_FAILED'))))
    OR (status = 'CAPTURING' AND pending_operation = 'CAPTURE' AND cancellation_reason IS NULL)
    OR (status = 'FAILED' AND pending_operation IS NULL AND (cancellation_reason IS NULL OR cancellation_reason = 'CAPTURE_FAILED'))
    OR (status = 'CANCELLED' AND pending_operation IS NULL AND cancellation_reason IN ('USER_REQUESTED','RESERVATION_EXPIRED'))
    OR (status = 'SUCCEEDED' AND pending_operation IS NULL AND cancellation_reason IS NULL)) IS TRUE"""


class payments(SQLModel, table=True):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint(PAYMENT_STATE_CHECK, name="ck_payments_state"),
        CheckConstraint("(status IN ('PENDING','AUTHORIZED','CAPTURING')) = (next_check_at IS NOT NULL)", name="ck_payments_next_check"),
        Index("ux_unfinished_payment", "order_id", unique=True, postgresql_where=text("status IN ('PENDING','AUTHORIZED','CAPTURING')")),
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
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
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    payment_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("payments.id"), nullable=True))
    provider_invoice_id: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    payload: dict = Field(default_factory=dict, sa_column=Column(pg.JSONB, nullable=False))
    verification_status: WebhookVerificationStatus = Field(default=WebhookVerificationStatus.PENDING, sa_column=Column(text_enum(WebhookVerificationStatus), nullable=False))
    processing_status: WebhookProcessingStatus = Field(default=WebhookProcessingStatus.PENDING, sa_column=Column(text_enum(WebhookProcessingStatus), nullable=False))
    received_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    processed_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))


class paid_sales_activations(SQLModel, table=True):
    __tablename__ = "paid_sales_activations"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id"), unique=True, nullable=False))
    status: ActivationStatus = Field(sa_column=Column(text_enum(ActivationStatus), nullable=False))
    approved_request_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), nullable=True))
    approved_payout_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("payout_accounts.id"), nullable=True))
    fee_amount_minor: int | None = Field(default=None, sa_column=Column(pg.BIGINT, nullable=True))
    fee_currency: str = Field(default="KZT", sa_column=Column(pg.TEXT, nullable=False, server_default="KZT"))
    paid_terms_version: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    paid_terms_accepted_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    activated_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    suspended_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=_now))


class payout_accounts(SQLModel, table=True):
    __tablename__ = "payout_accounts"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    owner_user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=False))
    owner_type: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    owner_name: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    identifier_encrypted: bytes = Field(sa_column=Column(pg.BYTEA, nullable=False))
    responsible_person_name: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    contact_email: str = Field(sa_column=Column(pg.CITEXT, nullable=False))
    contact_phone: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    iban_encrypted: bytes = Field(sa_column=Column(pg.BYTEA, nullable=False))
    bank_name: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    account_holder_name: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))


class paid_sales_activation_requests(SQLModel, table=True):
    __tablename__ = "paid_sales_activation_requests"
    __table_args__ = (Index("ux_pending_activation_review", "activation_id", unique=True, postgresql_where=text("status = 'PENDING'")),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    activation_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("paid_sales_activations.id"), nullable=False))
    submitted_by_user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=False))
    payout_account_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("payout_accounts.id"), nullable=False))
    status: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    verification_snapshot: dict = Field(default_factory=dict, sa_column=Column(pg.JSONB, nullable=False))
    terms_version: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    terms_accepted_at: datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    submitted_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    reviewed_by_user_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=True))
    reviewed_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    rejection_reason: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))


class activation_fee_payments(SQLModel, table=True):
    __tablename__ = "activation_fee_payments"
    __table_args__ = (
        Index("ux_unfinished_activation_fee", "activation_id", unique=True, postgresql_where=text("status IN ('PENDING','PROCESSING','UNKNOWN')")),
        Index("ux_success_activation_fee", "activation_id", unique=True, postgresql_where=text("status = 'SUCCEEDED'")),
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    activation_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("paid_sales_activations.id"), nullable=False))
    amount_minor: int = Field(sa_column=Column(pg.BIGINT, nullable=False))
    currency: str = Field(default="KZT", sa_column=Column(pg.TEXT, nullable=False, server_default="KZT"))
    status: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    idempotency_key: str = Field(sa_column=Column(pg.TEXT, unique=True, nullable=False))
    provider_operation_ref: str | None = Field(default=None, sa_column=Column(pg.TEXT, unique=True, nullable=True))
    payment_mode: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=_now))
    finalized_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    next_check_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
