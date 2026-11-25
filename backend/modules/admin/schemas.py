import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from backend.modules.events.schemas import EventLifecycleStatus, Visibility
from backend.modules.orders.schemas import OrderStatus
from backend.modules.payments.schemas import CancellationReason, PaymentStatus, PendingOperation
from backend.modules.users.user_model import EventRole, Role


class SuspensionRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class AdminUserEventRole(BaseModel):
    event_id: uuid.UUID
    event_public_id: str
    event_title: str
    role: EventRole


class AdminUser(BaseModel):
    id: uuid.UUID
    public_id: str
    email: str
    full_name: str | None
    phone: str | None
    personal_role: Role
    is_suspended: bool
    created_at: datetime
    event_roles: list[AdminUserEventRole]


class AdminEvent(BaseModel):
    id: uuid.UUID
    public_id: str
    title: str
    status: EventLifecycleStatus
    is_suspended: bool
    suspended_at: datetime | None
    suspension_reason: str | None
    suspended_by_name: str | None
    starts_at: datetime
    visibility: Visibility
    venue_name: str
    city: str
    capacity: int
    organizer_id: uuid.UUID | None
    organizer_name: str | None
    organizer_email: str | None
    tickets_issued: int
    tickets_sold: int
    paid_sales_status: str


class AdminOrder(BaseModel):
    id: uuid.UUID
    order_number: str
    event_id: uuid.UUID
    event_title: str
    event_public_id: str
    organizer_name: str | None
    buyer_name: str | None
    buyer_email: str
    status: OrderStatus
    subtotal_minor: int
    discount_minor: int
    total_minor: int
    created_at: datetime
    confirmed_at: datetime | None


class AdminPayment(BaseModel):
    id: uuid.UUID
    order_id: uuid.UUID
    order_number: str
    event_id: uuid.UUID
    event_title: str
    event_public_id: str
    organizer_name: str | None
    buyer_name: str | None
    buyer_email: str
    status: PaymentStatus
    pending_operation: PendingOperation | None
    cancellation_reason: CancellationReason | None
    amount_minor: int
    is_simulated: bool
    is_overdue: bool
    next_check_at: datetime | None
    created_at: datetime
    finalized_at: datetime | None


class TimelineEntry(BaseModel):
    at: datetime
    type: str
    title: str
    details: dict


class PaymentWebhook(BaseModel):
    id: uuid.UUID
    received_at: datetime
    processed_at: datetime | None
    verification_status: str
    processing_status: str
    payload: dict


class PaymentRefundAttempt(BaseModel):
    id: uuid.UUID
    refund_request_id: uuid.UUID
    status: str
    amount_minor: int
    created_at: datetime
    finalized_at: datetime | None


class AdminPaymentDetail(AdminPayment):
    order_status: OrderStatus
    currency: str
    provider_invoice_id: str | None
    provider_payment_id: str | None
    processing_fee_minor: int | None
    check_failure_count: int
    updated_at: datetime
    refunds: list[PaymentRefundAttempt]
    timeline: list[TimelineEntry]
    webhooks: list[PaymentWebhook]


class PaymentCheck(BaseModel):
    bank_status: str | None
    changed: bool
    payment: AdminPaymentDetail


class AdminCounters(BaseModel):
    event_applications: int
    change_requests: int
    paid_sales_requests: int
    refund_requests: int
    cancellation_requests: int
    support_cases: int
    support_unassigned: int
    payments_overdue: int


class AdminPromo(BaseModel):
    id: uuid.UUID
    code: str
    event_id: uuid.UUID
    event_title: str
    event_public_id: str
    organizer_name: str | None
    campaign_name: str | None
    is_active: bool
    max_redemptions: int | None
    redemption_count: int
    active_holds: int
    valid_until: datetime
