import uuid
from datetime import datetime

from pydantic import BaseModel


class HistoryActor(BaseModel):
    kind: str
    user_id: uuid.UUID | None
    display_name: str


class HistoryEntry(BaseModel):
    id: uuid.UUID
    created_at: datetime
    action_type: str
    category: str
    description: str
    result: str
    actor: HistoryActor
    entity_type: str
    entity_id: uuid.UUID | None
    entity_label: str | None
    details: dict


class HistoryPage(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[HistoryEntry]
