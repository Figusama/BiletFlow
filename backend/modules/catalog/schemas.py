import uuid

from pydantic import BaseModel, Field


class CategoryPublic(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    is_active: bool


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    is_active: bool | None = None


class LayoutPublic(BaseModel):
    id: uuid.UUID
    name: str
    version: int
    is_active: bool
    seats: int


class VenuePublic(BaseModel):
    id: uuid.UUID
    name: str
    address: str
    city: str
    timezone: str
    max_capacity: int
    layouts: list[LayoutPublic] = Field(default_factory=list)


class VenueCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(min_length=1, max_length=500)
    city: str = Field(min_length=1, max_length=100)
    timezone: str = Field(min_length=1, max_length=64)
    max_capacity: int = Field(gt=0)


class RowSpec(BaseModel):
    label: str = Field(min_length=1, max_length=20)
    seats: int = Field(gt=0, le=500)
    accessible_seats: list[int] = Field(default_factory=list)


class SectionSpec(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    rows: list[RowSpec] = Field(min_length=1)


class LayoutCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    sections: list[SectionSpec] = Field(min_length=1)
