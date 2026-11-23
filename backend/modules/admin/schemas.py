import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from backend.modules.events.schemas import EventLifecycleStatus
from backend.modules.orders.schemas import OrderStatus
from backend.modules.payments.schemas import CancellationReason, PaymentStatus, PendingOperation
from backend.modules.users.user_model import Role


class SuspensionRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class AdminUser(BaseModel):
    id: uuid.UUID
    public_id: str
    email: str
    full_name: str | None
    personal_role: Role
    is_suspended: bool
    created_at: datetime


class AdminEvent(BaseModel):
    id: uuid.UUID
    public_id: str
    title: str
    status: EventLifecycleStatus
    is_suspended: bool
    suspended_at: datetime | None
    suspension_reason: str | None
    starts_at: datetime
    organizer_email: str | None
    tickets_issued: int


class AdminOrder(BaseModel):
    id: uuid.UUID
    order_number: str
    event_id: uuid.UUID
    event_title: str
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
    status: PaymentStatus
    pending_operation: PendingOperation | None
    cancellation_reason: CancellationReason | None
    amount_minor: int
    is_simulated: bool
    is_overdue: bool
    next_check_at: datetime | None
    created_at: datetime
    finalized_at: datetime | None


class AdminPromo(BaseModel):
    id: uuid.UUID
    code: str
    event_id: uuid.UUID
    event_title: str
    campaign_name: str | None
    is_active: bool
    max_redemptions: int | None
    redemption_count: int
    active_holds: int
    valid_until: datetime
