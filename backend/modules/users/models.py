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
    is_suspended : bool = Field(default=False)
    is_platform_admin : bool = Field(default=False)
    password_hash : str = Field(exclude=True)
    email_verified_at : datetime = Field(sa_column=Column(pg.TIMESTAMP, default=datetime.now))
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
    display_name : str = ""
    contact_email : str = ""
    contact_phone : str = ""
    verification_status : bool = Field(default=False)
    payout_account_id : uuid.UUD = Field(foreign_key="organizers.uid")
    created_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP, default=datetime.now())
    )

class StaffAssignment(SQLModel, table=True):
    __tablename__ = "staff_assignment"

    uid : uuid.UUID = Field(
        sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    )
    user_uid : uuid.UUID = Field(foreign_key="users.uid")
    event_uid : uuid.UUID = Field(foreign_key="events.uid")
    role : UserRole = Field(sa_column=Column(pg.VARCHAR, nullable=False, server_default="attendee"))
    assigned_by : uuid.UUID = Field(foreign_key="users.uid")
    created_at : datetime = Field(
        sa_column=Column(pg.TIMESTAMP, default=datetime.now())
    )

