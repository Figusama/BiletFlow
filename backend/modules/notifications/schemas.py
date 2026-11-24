import uuid
from datetime import datetime

from pydantic import BaseModel


class NotificationPublic(BaseModel):
    id: uuid.UUID
    type: str
    title: str
    body: str
    action_url: str | None
    read_at: datetime | None
    created_at: datetime


class UnreadCount(BaseModel):
    unread: int
