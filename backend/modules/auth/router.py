from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, Response
from sqlmodel.ext.asyncio.session import AsyncSession

from core.config import settings
from core.errors import AppError
from core.security import create_access_token
from db.session import get_session
from modules.auth import service
from modules.auth.dependencies import get_current_user
from modules.auth.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    VerifyEmailRequest,
)
from modules.users.models import User

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "bf_refresh"
REFRESH_COOKIE_PATH = "/auth"


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.refresh_token_ttl_days * 24 * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=REFRESH_COOKIE_PATH,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        REFRESH_COOKIE, path=REFRESH_COOKIE_PATH, httponly=True, secure=settings.cookie_secure, samesite="lax"
    )


def token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id), expires_in=settings.access_token_ttl_minutes * 60
    )


@router.post("/register", response_model=MessageResponse, status_code=202)
async def register(
    data: RegisterRequest, background: BackgroundTasks, session: AsyncSession = Depends(get_session)
):
    await service.register(session, data, background)
    return MessageResponse(detail="Check your email to confirm registration")


@router.post("/verify-email", response_model=TokenResponse)
async def verify_email(data: VerifyEmailRequest, response: Response, session: AsyncSession = Depends(get_session)):
    user = await service.verify_email(session, data.token)
    set_refresh_cookie(response, await service.create_refresh_session(session, user))
    return token_response(user)


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, response: Response, session: AsyncSession = Depends(get_session)):
    user = await service.authenticate(session, data.email, data.password)
    set_refresh_cookie(response, await service.create_refresh_session(session, user))
    return token_response(user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    bf_refresh: str | None = Cookie(default=None),
    session: AsyncSession = Depends(get_session),
):
    if not bf_refresh:
        raise AppError(401, "INVALID_REFRESH_TOKEN", "Session expired, please sign in again")
    user, new_token = await service.rotate_refresh_session(session, bf_refresh)
    set_refresh_cookie(response, new_token)
    return token_response(user)


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    bf_refresh: str | None = Cookie(default=None),
    session: AsyncSession = Depends(get_session),
):
    if bf_refresh:
        await service.revoke_refresh_session(session, bf_refresh)
    clear_refresh_cookie(response)


@router.post("/forgot-password", response_model=MessageResponse, status_code=202)
async def forgot_password(
    data: ForgotPasswordRequest, background: BackgroundTasks, session: AsyncSession = Depends(get_session)
):
    await service.request_password_reset(session, data.email, background)
    return MessageResponse(detail="If this email is registered, a reset link has been sent")


@router.post("/reset-password", status_code=204)
async def reset_password(data: ResetPasswordRequest, session: AsyncSession = Depends(get_session)):
    await service.reset_password(session, data.token, data.new_password)


@router.post("/change-password", status_code=204)
async def change_password(
    data: ChangePasswordRequest,
    response: Response,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await service.change_password(session, user, data.current_password, data.new_password)
    clear_refresh_cookie(response)
