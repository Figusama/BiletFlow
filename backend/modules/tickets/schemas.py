import uuid
from datetime import datetime
from enum import Enum

from pydantic import AwareDatetime, BaseModel, Field


class TicketKind(str, Enum):
    FREE = "FREE"
    PAID = "PAID"

class SalesStatus(str, Enum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"

class TicketStatus(str, Enum):
    VALID = "VALID"
    CHECKED_IN = "CHECKED_IN"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"

class CheckInAction(str, Enum):
    SCAN = "SCAN"
    UNDO = "UNDO"

class ScanResult(str, Enum):
    ADMITTED = "admitted"
    ALREADY_USED = "already_used"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"
    INVALID = "invalid"
    WRONG_EVENT = "wrong_event"
    EVENT_CANCELLED = "event_cancelled"
    CAMPAIGN_QR_NOT_ADMISSION = "campaign_qr_not_admission"
    UNDONE = "undone"


class TicketTypeCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    kind: TicketKind
    price_minor: int = Field(ge=0)
    quantity_total: int | None = Field(default=None, gt=0)
    sales_start_at: AwareDatetime
    sales_end_at: AwareDatetime
    max_per_order: int = Field(gt=0)


class TicketTypeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    kind: TicketKind | None = None
    price_minor: int | None = Field(default=None, ge=0)
    quantity_total: int | None = Field(default=None, gt=0)
    sales_start_at: AwareDatetime | None = None
    sales_end_at: AwareDatetime | None = None
    max_per_order: int | None = Field(default=None, gt=0)
    sales_status: SalesStatus | None = None
    is_active: bool | None = None


class TicketTypePublic(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    description: str | None
    kind: TicketKind
    price_minor: int
    quantity_total: int | None
    sales_start_at: datetime
    sales_end_at: datetime
    sales_status: SalesStatus
    is_active: bool
    max_per_order: int
    sale_state: str
    available: int | None


class TicketPublic(BaseModel):
    id: uuid.UUID
    ticket_code: str
    event_id: uuid.UUID
    event_title: str
    event_starts_at: datetime
    event_timezone: str
    venue_name: str
    order_id: uuid.UUID
    order_number: str
    ticket_type_id: uuid.UUID
    ticket_type_name: str
    attendee_name: str
    seat_label: str | None
    status: TicketStatus
    issued_at: datetime
    checked_in_at: datetime | None
    qr_payload: str
    pdf_url: str


class AttendeeUpdate(BaseModel):
    attendee_name: str = Field(min_length=1, max_length=200)


class ScanRequest(BaseModel):
    event_id: uuid.UUID
    payload: str = Field(min_length=1, max_length=2048)


class ScanResponse(BaseModel):
    result: ScanResult
    ticket_id: uuid.UUID | None = None
    ticket_code: str | None = None
    attendee_name: str | None = None
    ticket_type_name: str | None = None
    seat_label: str | None = None
    checked_in_at: datetime | None = None


class AttendeeRow(BaseModel):
    ticket_id: uuid.UUID
    ticket_code: str
    attendee_name: str
    buyer_email: str
    ticket_type_name: str
    seat_label: str | None
    status: TicketStatus
    checked_in_at: datetime | None


class CheckInStats(BaseModel):
    registered: int
    checked_in: int
    absent: int
    check_in_percentage: float
