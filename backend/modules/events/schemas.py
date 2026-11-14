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

class EventCreate(SQLModel):
    title: str | None = None
    description: str | None = None
    venue_id: uuid.UUID | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None

class EventUpdate(SQLModel):
    title: str | None = None
    description: str | None = None
    venue_id: uuid.UUID | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None

class EventPublic(SQLModel):
    id: uuid.UUID
    title: str | None
    description: str | None
    venue_id: uuid.UUID | None
    start_at: datetime | None
    end_at: datetime | None
    status: EventStatus
    created_by_user_id: uuid.UUID