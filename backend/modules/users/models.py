import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, Index, text
from sqlalchemy.dialects.postgresql import CITEXT
from sqlmodel import Field, SQLModel

from core.timeutils import utcnow


class PersonalRole(str, Enum):
    USER = "USER"
    PLATFORM_ADMIN = "PLATFORM_ADMIN"


class EventRole(str, Enum):
    ORGANIZER = "ORGANIZER"
    EVENT_ADMIN = "EVENT_ADMIN"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    public_id: str = Field(unique=True, max_length=20)
    email: str = Field(sa_type=CITEXT, unique=True, index=True)
    password_hash: str
    personal_role: PersonalRole = Field(default=PersonalRole.USER)
    is_suspended: bool = False
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
    updated_at: datetime = Field(
        default_factory=utcnow, sa_type=DateTime(timezone=True), sa_column_kwargs={"onupdate": utcnow}
    )

    @property
    def is_platform_admin(self) -> bool:
        return self.personal_role == PersonalRole.PLATFORM_ADMIN

    def __repr__(self) -> str:
        return f"<User {self.public_id} {self.email}>"


class EventUserRole(SQLModel, table=True):
    __tablename__ = "event_user_roles"
    __table_args__ = (
        Index(
            "uq_event_user_roles_single_organizer",
            "event_id",
            unique=True,
            postgresql_where=text("event_role = 'ORGANIZER'"),
        ),
    )

    event_id: uuid.UUID = Field(foreign_key="events.id", primary_key=True, ondelete="CASCADE")
    user_id: uuid.UUID = Field(foreign_key="users.id", primary_key=True, index=True, ondelete="CASCADE")
    event_role: EventRole
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
