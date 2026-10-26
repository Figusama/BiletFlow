import uuid

from pydantic import BaseModel


class VenueRead(BaseModel):
    id: uuid.UUID
    name: str
    address: str
    city: str
    timezone: str
    max_capacity: int


class VenueLayoutRead(BaseModel):
    id: uuid.UUID
    name: str
    version: int


class VenueDetailRead(VenueRead):
    layouts: list[VenueLayoutRead]
