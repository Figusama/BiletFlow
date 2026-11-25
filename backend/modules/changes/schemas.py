import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ChangeField(str, Enum):
    TITLE = "TITLE"
    STARTS_AT = "STARTS_AT"
    ENDS_AT = "ENDS_AT"
    VENUE = "VENUE"
    VENUE_LAYOUT = "VENUE_LAYOUT"
    GA_CAPACITY = "GA_CAPACITY"
    RESPONSIBLE_NAME = "RESPONSIBLE_NAME"
    RESPONSIBLE_EMAIL = "RESPONSIBLE_EMAIL"
    RESPONSIBLE_PHONE = "RESPONSIBLE_PHONE"
    REFUND_POLICY = "REFUND_POLICY"
    CREATE_TICKET_TYPE = "CREATE_TICKET_TYPE"
    TICKET_TYPE_PRICE = "TICKET_TYPE_PRICE"
    TICKET_TYPE_QUANTITY = "TICKET_TYPE_QUANTITY"
    TICKET_TYPE_ACTIVE = "TICKET_TYPE_ACTIVE"
    TICKET_TYPE_SALES_WINDOW = "TICKET_TYPE_SALES_WINDOW"
    DELETE_TICKET_TYPE = "DELETE_TICKET_TYPE"


TARGETED_FIELDS = {ChangeField.TICKET_TYPE_PRICE, ChangeField.TICKET_TYPE_QUANTITY, ChangeField.TICKET_TYPE_ACTIVE, ChangeField.TICKET_TYPE_SALES_WINDOW,
                   ChangeField.DELETE_TICKET_TYPE}
TERMS_FIELDS = {ChangeField.STARTS_AT, ChangeField.ENDS_AT, ChangeField.VENUE, ChangeField.VENUE_LAYOUT, ChangeField.REFUND_POLICY}
SPECIAL_REFUND_FIELDS = {ChangeField.STARTS_AT, ChangeField.VENUE}


class ChangeItemInput(BaseModel):
    field: ChangeField
    target_id: uuid.UUID | None = None
    new_value: Any = None


class ChangeRequestInput(BaseModel):
    comment: str | None = Field(default=None, max_length=2000)
    items: list[ChangeItemInput] = Field(min_length=1, max_length=50)


class ChangeReview(BaseModel):
    review_comment: str | None = Field(default=None, max_length=2000)


class ChangeRejection(BaseModel):
    review_comment: str = Field(min_length=3, max_length=2000)


class ChangeItemPublic(BaseModel):
    id: uuid.UUID
    field: str
    target_id: uuid.UUID | None
    old_value: Any
    new_value: Any


class ChangeRequestPublic(BaseModel):
    id: uuid.UUID
    request_number: str
    event_id: uuid.UUID
    event_title: str
    event_public_id: str
    organizer_name: str | None
    status: str
    comment: str | None
    submitted_at: datetime | None
    reviewed_at: datetime | None
    review_comment: str | None
    created_at: datetime
    items: list[ChangeItemPublic]
