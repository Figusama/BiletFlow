import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, ForeignKey, func
from sqlalchemy.dialects import postgresql as pg
from sqlmodel import SQLModel, Field


class audit_logs(SQLModel, table=True):
    __tablename__ = "audit_logs"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    event_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id"), nullable=True))
    actor_type: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    actor_user_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=True))
    action_type: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    result: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    entity_type: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    entity_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), nullable=True))
    details: dict = Field(default_factory=dict, sa_column=Column(pg.JSONB, nullable=False))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
