import uuid

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.errors import AppError
from core.security import read_access_token
from db.session import get_session
from modules.users.models import EventRole, EventUserRole, User

bearer_scheme = HTTPBearer(auto_error=False)


def not_authenticated() -> AppError:
    return AppError(401, "NOT_AUTHENTICATED", "Not authenticated")


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> User | None:
    if credentials is None:
        return None
    user_id = read_access_token(credentials.credentials)
    user = await session.get(User, user_id) if user_id else None
    if user is None:
        raise not_authenticated()
    if user.is_suspended:
        raise AppError(403, "ACCOUNT_SUSPENDED", "This account is suspended")
    return user


async def get_current_user(user: User | None = Depends(get_optional_user)) -> User:
    if user is None:
        raise not_authenticated()
    return user


async def require_platform_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_platform_admin:
        raise AppError(403, "FORBIDDEN", "Platform admin only")
    return user


async def get_event_role(session: AsyncSession, user: User, event_id: uuid.UUID) -> EventRole | None:
    row = (
        await session.exec(
            select(EventUserRole).where(EventUserRole.event_id == event_id, EventUserRole.user_id == user.id)
        )
    ).first()
    return row.event_role if row else None


async def ensure_event_role(
    session: AsyncSession,
    user: User,
    event_id: uuid.UUID,
    *roles: EventRole,
    allow_platform_admin: bool = True,
) -> None:
    if allow_platform_admin and user.is_platform_admin:
        return
    if await get_event_role(session, user, event_id) not in roles:
        raise AppError(403, "FORBIDDEN", "You do not have access to this event")
