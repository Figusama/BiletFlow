import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel

from core.timeutils import utcnow


class UserRole(str, Enum):
    ATTENDEE = "attendee"
    ORGANIZER = "organizer"
    EVENT_ADMIN = "event_admin"
    PLATFORM_ADMIN = "platform_admin"


class User(SQLModel, table=True):
    __tablename__ = "users"

<<<<<<< HEAD:backend/modules/users/models_archive.py
class Attendee(SQLModel, table=True):
    __tablename__ = "attendee"
    id : uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    public_id : str
    email : str
    first_name : str
    last_name : str
    role : UserRole = Field(sa_column=Column(pg.VARCHAR, nullable=False, server_default="attendee"))
    is_suspended : bool = Field(default=False)
    is_platform_admin : bool = Field(default=False)
    password_hash : str = Field(exclude=True)
    email_verified_at : datetime = Field(sa_column=Column(pg.TIMESTAMP, default=datetime.now))
    create_at : datetime = Field(sa_column=Column(pg.TIMESTAMP, default=datetime.now))
    updated_at : datetime = Field(sa_column=Column(pg.TIMESTAMP, default=datetime.now))

    def __repr__(self):
        return f"<Attendee {self.username}>"
=======
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(max_length=320, unique=True, index=True)
    password_hash: str
    email_verified_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    phone: str | None = Field(default=None, max_length=32)
    locale: str | None = Field(default=None, max_length=10)
    is_platform_admin: bool = False
    is_suspended: bool = False
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))

    def __repr__(self) -> str:
        return f"<User {self.email}>"
>>>>>>> main:backend/modules/users/models.py


class OrganizerProfile(SQLModel, table=True):
    __tablename__ = "organizer_profiles"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", unique=True, ondelete="CASCADE")
    is_verified: bool = False
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))


class StaffAssignment(SQLModel, table=True):
    __tablename__ = "staff_assignment"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", ondelete="CASCADE")
    event_id: uuid.UUID = Field(foreign_key="events.id", ondelete="CASCADE")
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
