from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from modules.users.models import EventUserRole, Profile, User
from modules.users.schemas import EventRoleRead, MeRead


async def build_me(session: AsyncSession, user: User) -> MeRead:
    profile = await session.get(Profile, user.id)
    roles = (await session.exec(select(EventUserRole).where(EventUserRole.user_id == user.id))).all()
    return MeRead(
        id=user.id,
        public_id=user.public_id,
        email=user.email,
        personal_role=user.personal_role,
        full_name=profile.full_name,
        phone=profile.phone,
        avatar_url=profile.avatar_url,
        locale=profile.locale,
        created_at=user.created_at,
        event_roles=[EventRoleRead(event_id=r.event_id, event_role=r.event_role) for r in roles],
    )
