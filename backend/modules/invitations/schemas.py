import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, EmailStr, Field


class StaffRole(str, Enum):
    EVENT_ADMIN = "EVENT_ADMIN"
    EVENT_SUPPORT = "EVENT_SUPPORT"


class StaffInvitationCreate(BaseModel):
    user_public_id: str = Field(min_length=1, max_length=64)
    role: StaffRole


class StaffInvitationPublic(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    event_title: str
    invited_user_public_id: str
    invited_user_name: str | None
    invited_role: StaffRole
    status: str
    expires_at: datetime
    created_at: datetime
    accepted_at: datetime | None
    declined_at: datetime | None
    revoked_at: datetime | None


class StaffMember(BaseModel):
    user_id: uuid.UUID
    public_id: str
    full_name: str | None
    roles: list[str]


class StaffOverview(BaseModel):
    members: list[StaffMember]
    invitations: list[StaffInvitationPublic]


class PrivateInvitationCreate(BaseModel):
    emails: list[EmailStr] = Field(min_length=1, max_length=100)


class PrivateInvitationPublic(BaseModel):
    id: uuid.UUID
    invited_email: str
    created_at: datetime
    expires_at: datetime
    is_active: bool
    tickets_count: int


class PrivateInvitationTarget(BaseModel):
    event_id: uuid.UUID
    slug: str
    expires_at: datetime
