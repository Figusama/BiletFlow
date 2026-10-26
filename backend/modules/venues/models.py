import uuid
from datetime import datetime

from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel

from core.timeutils import utcnow


class Venue(SQLModel, table=True):
    __tablename__ = "venues"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=200)
    address: str = Field(max_length=300)
    city: str = Field(max_length=100, index=True)
    timezone: str = Field(max_length=64)
    max_capacity: int = Field(gt=0)
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
    updated_at: datetime = Field(
        default_factory=utcnow, sa_type=DateTime(timezone=True), sa_column_kwargs={"onupdate": utcnow}
    )


class VenueLayout(SQLModel, table=True):
    __tablename__ = "venue_layouts"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    venue_id: uuid.UUID = Field(foreign_key="venues.id", index=True)
    name: str = Field(max_length=200)
    version: int = 1
    is_active: bool = True
