import sqlalchemy.dialects.postgresql as pg
from datetime import datetime
import uuid
from sqlmodel import SQLModel, Field, Column
from enum import Enum
import sqlalchemy as sa
import secrets

class Role(str, Enum):
    USER = "USER"
    PLATFORM_ADMIN = "PLATFORM_ADMIN"


class EventRole(str, Enum):
    ORGANIZER = "ORGANIZER"
    EVENT_ADMIN = "EVENT_ADMIN"


class users(SQLModel, table=True):
    __tablename__ = "users"

    id : uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )

    public_id : str = Field(
        sa_column=Column(sa.String, default=lambda: secrets.token_urlsafe(8), unique=True, nullable=False, index=True)
    )
    email : str = Field(sa_column=Column(pg.CITEXT, unique=True, nullable=False))
    password_hash : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    personal_role : Role = Field(default=Role.USER, sa_column=Column(pg.ENUM(Role, name="personal_value"), nullable=False, server_default=Role.USER.value))
    is_suspended : bool = Field(default=False, sa_column=Column(pg.BOOLEAN, nullable=False, server_default=sa.false()))
    created_at : datetime = Field(sa_column=Column(pg.TIMESTAMP, default=datetime.now))
    updated_at : datetime = Field(sa_column=Column(pg.TIMESTAMP, default=datetime.now))


class profiles(SQLModel, table=True):
    __tablename__ = "profiles"

    user_id : uuid.UUID = Field(
        sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, nullable=False)
    )
    full_name : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    phone : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    avatar_url : str = Field(sa_column=Column(pg.TEXT, nullable=True))
    locale : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    created_at : datetime = Field(sa_column=Column(pg.TIMESTAMP, default=datetime.now))
    updated_at : datetime = Field(sa_column=Column(pg.TIMESTAMP, default=datetime.now))

class event_user_roles(SQLModel, table=True):
    __tablename__ = "event_user_roles"
    
    event_id : uuid.UUID
    user_id : uuid.UUID = Field(
            sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, nullable=False)
        )
    event_role : EventRole  