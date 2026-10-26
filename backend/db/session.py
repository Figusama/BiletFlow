from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from core.config import settings

engine = create_async_engine(settings.database_url)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session():
    async with SessionLocal() as session:
        yield session


async def create_tables() -> None:
    import modules.auth.models  # noqa: F401
    import modules.categories.models  # noqa: F401
    import modules.event_applications.models  # noqa: F401
    import modules.events.models  # noqa: F401
    import modules.users.models  # noqa: F401
    import modules.venues.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS citext"))
        await conn.run_sync(SQLModel.metadata.create_all)
