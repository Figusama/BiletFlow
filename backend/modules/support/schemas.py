import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class CaseScope(str, Enum):
    EVENT_SUPPORT = "EVENT_SUPPORT"
    PLATFORM_SUPPORT = "PLATFORM_SUPPORT"


class CaseCategory(str, Enum):
    TICKETS = "TICKETS"
    PAYMENT = "PAYMENT"
    REFUND = "REFUND"
    EVENT_INFO = "EVENT_INFO"
    ACCOUNT = "ACCOUNT"
    ORGANIZER = "ORGANIZER"
    SEATING = "SEATING"
    CHECK_IN = "CHECK_IN"
    TECHNICAL = "TECHNICAL"
    EVENT_COMPLAINT = "EVENT_COMPLAINT"
    OTHER = "OTHER"


class CaseStatus(str, Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    WAITING_FOR_CUSTOMER = "WAITING_FOR_CUSTOMER"
    RESOLVED = "RESOLVED"


class CaseCreate(BaseModel):
    case_scope: CaseScope
    event_id: uuid.UUID | None = None
    order_id: uuid.UUID | None = None
    ticket_id: uuid.UUID | None = None
    previous_case_id: uuid.UUID | None = None
    category: CaseCategory
    custom_subject: str | None = Field(default=None, max_length=200)
    message: str = Field(min_length=1, max_length=5000)
    client_message_id: uuid.UUID


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    client_message_id: uuid.UUID


class ReadMark(BaseModel):
    up_to_seq: int = Field(ge=0)


class StatusChange(BaseModel):
    status: CaseStatus


class Assignment(BaseModel):
    user_id: uuid.UUID


class MessagePublic(BaseModel):
    id: uuid.UUID
    seq: int
    sender_user_id: uuid.UUID
    sender_name: str | None
    from_requester: bool
    body: str
    created_at: datetime


class HistoryPublic(BaseModel):
    action: str
    actor_user_id: uuid.UUID | None
    actor_name: str | None
    old_status: str | None
    new_status: str | None
    old_assignee_user_id: uuid.UUID | None
    old_assignee_name: str | None
    new_assignee_user_id: uuid.UUID | None
    new_assignee_name: str | None
    created_at: datetime


class CasePublic(BaseModel):
    id: uuid.UUID
    case_number: int
    requester_user_id: uuid.UUID
    requester_name: str | None
    case_scope: CaseScope
    event_id: uuid.UUID | None
    event_title: str | None
    event_public_id: str | None
    organizer_name: str | None
    order_id: uuid.UUID | None
    order_number: str | None
    ticket_id: uuid.UUID | None
    previous_case_id: uuid.UUID | None
    category: str
    custom_subject: str | None
    status: CaseStatus
    assigned_to_user_id: uuid.UUID | None
    assignee_name: str | None
    escalated_to_platform: bool
    resolved_at: datetime | None
    last_message_seq: int
    unread: int
    created_at: datetime
    updated_at: datetime


class CaseAssignee(BaseModel):
    user_id: uuid.UUID
    full_name: str | None
    roles: list[str]
    is_current: bool


class PlatformAssignee(BaseModel):
    user_id: uuid.UUID
    full_name: str | None
    email: str


class CaseDetail(CasePublic):
    messages: list[MessagePublic]
    history: list[HistoryPublic]
