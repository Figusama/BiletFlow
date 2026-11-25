import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator

from backend.modules.payments.schemas import PaymentStatus
from backend.modules.tickets.schemas import TicketStatus


MAX_ATTENDEE_NAME = 120


class ReservationStatus(str, Enum):
    ACTIVE = "ACTIVE"
    PROTECTED = "PROTECTED"
    CONVERTED = "CONVERTED"
    RELEASED = "RELEASED"

class OrderStatus(str, Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class ReservationLine(BaseModel):
    ticket_type_id: uuid.UUID
    quantity: int = Field(gt=0)


class ReservationCreate(BaseModel):
    items: list[ReservationLine] = Field(default_factory=list)
    event_seat_ids: list[uuid.UUID] = Field(default_factory=list)

    @model_validator(mode="after")
    def one_mode(self):
        if bool(self.items) == bool(self.event_seat_ids):
            raise ValueError("Provide either items (general admission) or event_seat_ids (assigned seating)")
        if len(set(self.event_seat_ids)) != len(self.event_seat_ids):
            raise ValueError("Duplicate seats")
        if len({line.ticket_type_id for line in self.items}) != len(self.items):
            raise ValueError("Duplicate ticket types")
        return self


class ReservationItemPublic(BaseModel):
    ticket_type_id: uuid.UUID
    event_seat_id: uuid.UUID | None
    quantity: int


class ReservationPublic(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    status: ReservationStatus
    expires_at: datetime
    is_expired: bool
    items: list[ReservationItemPublic]


class AttendeeLine(BaseModel):
    ticket_type_id: uuid.UUID
    event_seat_id: uuid.UUID | None = None
    names: list[str] = Field(max_length=100)

    @field_validator("names")
    @classmethod
    def clean(cls, names: list[str]) -> list[str]:
        cleaned = [" ".join(name.split()) for name in names]
        if any(len(name) > MAX_ATTENDEE_NAME or not name.isprintable() for name in cleaned):
            raise ValueError(f"Attendee name must be plain text of at most {MAX_ATTENDEE_NAME} characters")
        return cleaned


class OrderCreate(BaseModel):
    promo_code: str | None = Field(default=None, max_length=64)
    attendees: list[AttendeeLine] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def unique_lines(self):
        keys = [(line.ticket_type_id, line.event_seat_id) for line in self.attendees]
        if len(set(keys)) != len(keys):
            raise ValueError("Duplicate attendee lines")
        return self


class OrderItemPublic(BaseModel):
    attendee_names: list[str | None]
    id: uuid.UUID
    ticket_type_id: uuid.UUID
    ticket_type_name: str
    event_seat_id: uuid.UUID | None
    seat_label: str | None
    unit_price_minor: int
    quantity: int
    line_subtotal_minor: int
    line_discount_minor: int


class OrderPublic(BaseModel):
    id: uuid.UUID
    order_number: str
    event_id: uuid.UUID
    event_title: str
    reservation_id: uuid.UUID
    status: OrderStatus
    subtotal_minor: int
    discount_minor: int
    total_minor: int
    promo_code: str | None
    requires_payment: bool
    reservation_expires_at: datetime
    created_at: datetime
    confirmed_at: datetime | None
    items: list[OrderItemPublic]
    ticket_ids: list[uuid.UUID]


class EventOrder(BaseModel):
    id: uuid.UUID
    order_number: str
    status: OrderStatus
    buyer_name: str | None
    buyer_email: str
    tickets: int
    subtotal_minor: int
    discount_minor: int
    total_minor: int
    refund_status: str | None
    refund_execution_status: str | None
    created_at: datetime
    confirmed_at: datetime | None


class EventAttendee(BaseModel):
    ticket_id: uuid.UUID | None
    ticket_public_id: str | None
    attendee_name: str | None
    ticket_type_id: uuid.UUID | None
    ticket_type_name: str | None
    seat_label: str | None
    ticket_status: TicketStatus | None
    checked_in_at: datetime | None
    quantity: int
    order_id: uuid.UUID
    order_number: str
    order_status: OrderStatus
    payment_status: PaymentStatus | None
    buyer_name: str | None
    buyer_email: str
    paid_minor: int
    promo_code: str | None


class AttendeeCounts(BaseModel):
    all: int
    checked_in: int
    pending_orders: int


class AttendeePage(BaseModel):
    items: list[EventAttendee]
    total: int
    counts: AttendeeCounts


class OrderTicket(BaseModel):
    ticket_id: uuid.UUID
    ticket_public_id: str
    attendee_name: str
    ticket_type_id: uuid.UUID
    ticket_type_name: str
    seat_label: str | None
    status: TicketStatus
    checked_in_at: datetime | None


class OrderPaymentInfo(BaseModel):
    id: uuid.UUID
    status: PaymentStatus
    attempt_number: int
    created_at: datetime
    finalized_at: datetime | None


class OrderRefundInfo(BaseModel):
    id: uuid.UUID
    source: str
    status: str
    execution_status: str | None
    reason_code: str | None
    comment: str | None
    created_at: datetime
    reviewed_at: datetime | None
    escalates_at: datetime | None


class EventOrderDetail(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    order_number: str
    status: OrderStatus
    created_at: datetime
    confirmed_at: datetime | None
    buyer_name: str | None
    buyer_email: str
    items: list[OrderItemPublic]
    tickets: list[OrderTicket]
    subtotal_minor: int
    discount_minor: int
    total_minor: int
    promo_code: str | None
    payment: OrderPaymentInfo | None
    refund_policy: dict
    refund_deadline: datetime | None
    refund: OrderRefundInfo | None
