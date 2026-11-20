import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, model_validator


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


class OrderCreate(BaseModel):
    promo_code: str | None = Field(default=None, max_length=64)


class OrderItemPublic(BaseModel):
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
