import re
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field

from modules.users.models import EventRole, PersonalRole

Locale = Literal["kk", "ru", "en"]


def normalize_kz_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if len(digits) == 11 and digits[0] in "78":
        digits = digits[1:]
    if len(digits) != 10:
        raise ValueError("Phone must be a Kazakhstan number like +7 701 123 45 67")
    return "+7" + digits


Phone = Annotated[str, AfterValidator(normalize_kz_phone)]
FullName = Annotated[str, Field(min_length=1, max_length=200)]


class EventRoleRead(BaseModel):
    event_id: uuid.UUID
    event_role: EventRole


class MeRead(BaseModel):
    id: uuid.UUID
    public_id: str
    email: str
    personal_role: PersonalRole
    full_name: str
    phone: str
    avatar_url: str | None
    locale: str
    created_at: datetime
    event_roles: list[EventRoleRead]


class ProfileUpdate(BaseModel):
    full_name: FullName | None = None
    phone: Phone | None = None
    locale: Locale | None = None
