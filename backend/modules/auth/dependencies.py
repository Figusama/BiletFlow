from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlmodel.ext.asyncio.session import AsyncSession

from core.security import read_access_token
from db.session import get_session
from modules.users.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


async def get_current_user(
    token: str = Depends(oauth2_scheme), session: AsyncSession = Depends(get_session)
) -> User:
    user_id = read_access_token(token)
    user = await session.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(401, "Invalid token", headers={"WWW-Authenticate": "Bearer"})
    return user


async def get_optional_user(
    token: str | None = Depends(optional_oauth2_scheme), session: AsyncSession = Depends(get_session)
) -> User | None:
    if token is None:
        return None
    return await get_current_user(token, session)
