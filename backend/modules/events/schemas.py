import uuid
from enum import Enum
from sqlmodel import SQLModel
from datetime import datetime


class EventStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    WITHDRAWN = "WITHDRAWN"

class EventLifecycleStatus(str, Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"

class Visibility(str, Enum):
    PUBLIC = "PUBLIC"
    UNLISTED = "UNLISTED"
    PRIVATE = "PRIVATE"

class SeatingMode(str, Enum):
    GENERAL_ADMISSION = "GENERAL_ADMISSION"
    ASSIGNED_SEATING = "ASSIGNED_SEATING"

class EventChangeField(str, Enum):
    TITLE = "TITLE"
    DESCRIPTION = "DESCRIPTION"
    START_AT = "START_AT"
    END_AT = "END_AT"
    LOCATION = "LOCATION"

class EventUpdate(SQLModel):
    ga_capacity: int | None = None
    public_contact_name: str | None = None
    public_contact_email: str | None = None
    public_contact_phone: str | None = None

class CreateEvent(SQLModel):

    title : str | None = None
    description : str | None = None

    venue_name_snapshot : str | None = None
    venue_address_snapshot : str | None = None
    venue_city_snapshot : str | None = None

    starts_at : datetime | None = None
    ends_at : datetime | None = None
    timezone : str | None = None

    visibility : Visibility | None = None
    seating_mode : SeatingMode | None = None

    responsible_name : str | None = None
    responsible_email : str | None = None
    responsible_phone : str | None = None

    intends_paid_sales : bool = False





class EventPublic(SQLModel):
    id: uuid.UUID
    public_id: str
    slug: str
    title: str
    description: str
    venue_id: uuid.UUID
    venue_name: str | None = None
    venue_address: str | None = None
    venue_city: str | None = None
    starts_at: datetime
    ends_at: datetime
    timezone: str
    visibility: Visibility
    seating_mode: SeatingMode
    ga_capacity: int | None
    status: EventLifecycleStatus
    is_suspended: bool
    public_contact_name: str | None
    public_contact_email: str | None
    public_contact_phone: str | None
    published_at: datetime | None
    cancelled_at: datetime | None
    calendar_ics_url: str | None = None
    google_calendar_url: str | None = None