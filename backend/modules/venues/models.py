import uuid

from sqlmodel import Field, SQLModel


class Venue(SQLModel, table=True):
    __tablename__ = "venues"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=200)
    address: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=100)
    timezone: str | None = Field(default=None, max_length=64)
    created_by_organizer_id: uuid.UUID | None = Field(default=None, foreign_key="organizer_profiles.id")
