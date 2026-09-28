import uuid
from datetime import datetime

from pydantic import AwareDatetime, BaseModel, Field, model_validator

from modules.events.models import EventStatus, EventVisibility, SeatingType


class EventCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = None
    category: str | None = Field(default=None, max_length=50)
    venue_id: uuid.UUID | None = None
    visibility: EventVisibility = EventVisibility.PUBLIC
    seating_type: SeatingType = SeatingType.GENERAL_ADMISSION
    capacity: int | None = Field(default=None, gt=0)
    registration_opens_at: AwareDatetime | None = None
    registration_closes_at: AwareDatetime | None = None
    event_start_at: AwareDatetime
    event_end_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def check_dates(self):
        if self.event_end_at and self.event_end_at <= self.event_start_at:
            raise ValueError("event_end_at must be after event_start_at")
        if self.registration_opens_at and self.registration_closes_at:
            if self.registration_closes_at <= self.registration_opens_at:
                raise ValueError("registration_closes_at must be after registration_opens_at")
        return self


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = None
    category: str | None = Field(default=None, max_length=50)
    venue_id: uuid.UUID | None = None
    visibility: EventVisibility | None = None
    seating_type: SeatingType | None = None
    capacity: int | None = Field(default=None, gt=0)
    registration_opens_at: AwareDatetime | None = None
    registration_closes_at: AwareDatetime | None = None
    event_start_at: AwareDatetime | None = None
    event_end_at: AwareDatetime | None = None


class EventRead(BaseModel):
    id: uuid.UUID
    organizer_profile_id: uuid.UUID
    title: str
    slug: str
    description: str | None
    category: str | None
    venue_id: uuid.UUID | None
    visibility: EventVisibility
    status: EventStatus
    seating_type: SeatingType
    capacity: int | None
    registration_opens_at: datetime | None
    registration_closes_at: datetime | None
    event_start_at: datetime
    event_end_at: datetime | None
    paid_sales_active: bool
