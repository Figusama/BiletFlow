import uuid
from enum import Enum
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import SQLModel
from datetime import datetime
from pydantic import field_validator

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

class EventUpdate(BaseModel):
    ga_capacity: int | None = None
    description: str | None = Field(default=None, min_length=1, max_length=20000)
    public_contact_name: str | None = Field(default=None, max_length=200)
    public_contact_email: EmailStr | None = None
    public_contact_phone: str | None = Field(default=None, max_length=40)
    public_instagram_url: str | None = Field(default=None, max_length=300, pattern=r"^https://(www\.)?instagram\.com/\S+$")
    public_telegram_url: str | None = Field(default=None, max_length=300, pattern=r"^https://t\.me/\S+$")
    public_website_url: str | None = Field(default=None, max_length=300, pattern=r"^https://\S+$")
    refund_policy: dict | None = None
    visibility : Visibility | None = None


class EventCategory(SQLModel):
    id: uuid.UUID
    name: str
    slug: str

class EventImage(SQLModel):
    id: uuid.UUID
    position: int
    url: str

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

class CreatedEvent(CreateEvent):
    id: uuid.UUID
    application_number: str
    status: EventStatus

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
    public_instagram_url: str | None = None
    public_telegram_url: str | None = None
    public_website_url: str | None = None
    refund_policy: dict = {}
    purchase_terms_version: int = 1
    categories: list[EventCategory] = []
    images: list[EventImage] = []
    cover_image_url: str | None = None

class EventManage(EventPublic):
    responsible_name : str | None = None
    responsible_email : str | None = None
    responsible_phone : str | None = None
    tickets_issued : bool = False


class ApplicationReject(SQLModel):
    review_comment: str

    @field_validator("review_comment")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("review_comment must not be empty")
        return v
