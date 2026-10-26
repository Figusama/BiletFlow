import uuid
from pydantic import BaseModel, EmailStr, Field
from backend.modules.users.user_model import Role
from enum import Enum

class UserCreate(BaseModel):
    email : str
    password : str = Field(min_length=8)
    full_name : str
    phone : str
    locale : str = "en"


class UserPublic(BaseModel):
    id : uuid.UUID
    public_id : str
    email : str
    personal_role : Role
    full_name : str


class Token(BaseModel):
    access_token: str
    token_type : str


class ProfileUpdate(BaseModel):
    full_name : str | None = None
    phone : str | None = None
    locale : str | None = None


class PasswordChange(BaseModel):
    new_password : str = Field(min_length=8)