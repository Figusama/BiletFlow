from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from db.session import get_session
from modules.auth.dependencies import get_current_user
from modules.users.models import Profile, User
from modules.users.schemas import MeRead, ProfileUpdate
from modules.users.service import build_me

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=MeRead)
async def get_me(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    return await build_me(session, user)


@router.patch("/me", response_model=MeRead)
async def update_me(
    data: ProfileUpdate, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    profile = await session.get(Profile, user.id)
    for field, value in data.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(profile, field, value)
    session.add(profile)
    await session.commit()
    return await build_me(session, user)
