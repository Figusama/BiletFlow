import sqlalchemy.dialects.postgresql as pg
from datetime import datetime
import uuid
from sqlmodel import SQLModel, Field, Column
from enum import Enum

class UserRole(str, Enum):
    ATTENDEE = "attendee"
    ORGANIZER = "organizer"
    EVENT_ADMIN = "event_admin"
    PLATFORM_ADMIN = "platform_admin"



class Attendee(SQLModel, table=True):
    __tablename__ = "Attendee"
    uid : uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)

    )
    username : str
    email : str
    first_name : str
    last_name : str
    role : UserRole = Field(sa_column=Column(pg.VARCHAR, nullable=False, server_default="attendee"))
    is_verified : bool = Field(default=False)
    password_hash : str = Field(exclude=True)
    create_at : datetime = Field(sa_column=Column(pg.TIMESTAMP, default=datetime.now))
    updated_at : datetime = Field(sa_column=Column(pg.TIMESTAMP, default=datetime.now))

    def __repr__(self):
        return f"<Attendee {self.username}>"


class OrganizerProfile(SQLModel, table=True):
    __tablename__ = "organizer_profiles"

    uid : uuid.UUID = Field(
        sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    )

    user_uid : uuid.UUD = Field(foreign_key="users.uid")

    is_verified : bool = Field(default=False)

    created_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP, default=datetime.now())
    )

class EventAdminAssignment(SQLModel, table=True):
    __tablename__ = "event_admin_profiles"

    uid : uuid.UUID = Field(
        sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    )
    user_uid : uuid.UUID = Field(foreign_key="users.uid")
    event_uid : uuid.UUID = Field(foreign_key="events.uid")

    created_at : datetime = Field(
        sa_column=Column(pg.TIMESTAMP, default=datetime.now())
    )

