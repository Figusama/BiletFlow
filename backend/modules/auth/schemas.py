from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, EmailStr

from modules.users.schemas import FullName, Locale, Phone


def check_password(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(value.encode()) > 72:
        raise ValueError("Password is too long")
    return value


Password = Annotated[str, AfterValidator(check_password)]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: Password
    full_name: FullName
    phone: Phone
    locale: Locale = "ru"


class VerifyEmailRequest(BaseModel):
    token: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: Password


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: Password


class MessageResponse(BaseModel):
    detail: str
