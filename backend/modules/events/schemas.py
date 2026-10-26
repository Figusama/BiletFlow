import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from core.storage import ImageRead
from modules.categories.schemas import CategoryRead
from modules.events.models import EventStatus, EventVisibility, SeatingMode
from modules.users.schemas import Phone
from modules.venues.schemas import VenueRead


class EventRead(BaseModel):
    id: uuid.UUID
    public_id: str
    slug: str
    title: str
    description: str
    venue: VenueRead
    venue_layout_id: uuid.UUID | None
    starts_at: datetime
    ends_at: datetime
    timezone: str
    visibility: EventVisibility
    seating_mode: SeatingMode
    public_contact_name: str | None
    public_contact_email: str | None
    public_contact_phone: str | None
    status: EventStatus
    published_at: datetime | None
    cancelled_at: datetime | None
    categories: list[CategoryRead]
    images: list[ImageRead]


class EventManageRead(EventRead):
    source_application_id: uuid.UUID
    responsible_name: str
    responsible_email: str
    responsible_phone: str
    created_at: datetime
    updated_at: datetime


class EventUpdate(BaseModel):
    visibility: EventVisibility | None = None
    public_contact_name: str | None = Field(default=None, max_length=200)
    public_contact_email: EmailStr | None = None
    public_contact_phone: Phone | None = None
