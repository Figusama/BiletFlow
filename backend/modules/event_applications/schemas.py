import uuid
from datetime import datetime

from pydantic import AwareDatetime, BaseModel, EmailStr, Field

from core.storage import ImageRead
from modules.categories.schemas import CategoryRead
from modules.event_applications.models import ApplicationStatus
from modules.events.models import EventVisibility, SeatingMode
from modules.users.schemas import FullName, Phone


class ApplicationWrite(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    category_ids: list[uuid.UUID] | None = None
    venue_id: uuid.UUID | None = None
    venue_layout_id: uuid.UUID | None = None
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None
    timezone: str | None = Field(default=None, max_length=64)
    visibility: EventVisibility | None = None
    seating_mode: SeatingMode | None = None
    responsible_name: FullName | None = None
    responsible_email: EmailStr | None = None
    responsible_phone: Phone | None = None
    intends_paid_sales: bool | None = None
    accept_organizer_terms: bool | None = None


class ApplicationRead(BaseModel):
    id: uuid.UUID
    application_number: str
    applicant_user_id: uuid.UUID
    status: ApplicationStatus

    title: str | None
    description: str | None
    categories: list[CategoryRead]
    images: list[ImageRead]

    venue_id: uuid.UUID | None
    venue_name_snapshot: str | None
    venue_address_snapshot: str | None
    venue_city_snapshot: str | None
    venue_layout_id: uuid.UUID | None

    starts_at: datetime | None
    ends_at: datetime | None
    timezone: str | None
    visibility: EventVisibility | None
    seating_mode: SeatingMode | None

    responsible_name: str | None
    responsible_email: str | None
    responsible_phone: str | None

    intends_paid_sales: bool
    organizer_terms_version: str | None
    organizer_terms_accepted_at: datetime | None
    submitted_at: datetime | None

    reviewed_by_user_id: uuid.UUID | None
    reviewed_at: datetime | None
    review_comment: str | None

    event_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class ApproveRequest(BaseModel):
    review_comment: str | None = Field(default=None, max_length=2000)


class RejectRequest(BaseModel):
    review_comment: str = Field(min_length=1, max_length=2000)
