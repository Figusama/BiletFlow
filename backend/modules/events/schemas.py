import uuid
from datetime import datetime

from pydantic import AwareDatetime, BaseModel, Field, model_validator

from modules.events.models import EventStatus, EventVisibility


class EventCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = None
    category: str | None = Field(default=None, max_length=50)
    cover_image_url: str | None = None
    venue_name: str | None = Field(default=None, max_length=200)
    venue_address: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=100)
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    timezone: str = "Asia/Almaty"
    visibility: EventVisibility = EventVisibility.PUBLIC

    @model_validator(mode="after")
    def check_dates(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = None
    category: str | None = Field(default=None, max_length=50)
    cover_image_url: str | None = None
    venue_name: str | None = Field(default=None, max_length=200)
    venue_address: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=100)
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None
    timezone: str | None = None
    visibility: EventVisibility | None = None


class EventRead(BaseModel):
    id: uuid.UUID
    organizer_id: uuid.UUID
    slug: str
    title: str
    description: str | None
    category: str | None
    cover_image_url: str | None
    venue_name: str | None
    venue_address: str | None
    city: str | None
    starts_at: datetime
    ends_at: datetime
    timezone: str
    status: EventStatus
    visibility: EventVisibility
    paid_sales_active: bool
    published_at: datetime | None
    created_at: datetime
