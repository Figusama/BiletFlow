import uuid

from pydantic import BaseModel


class CategoryRead(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
