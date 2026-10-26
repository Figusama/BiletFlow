from fastapi import APIRouter, Depends
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from db.session import get_session
from modules.categories.models import Category
from modules.categories.schemas import CategoryRead

router = APIRouter(prefix="/categories", tags=["catalog"])


@router.get("", response_model=list[CategoryRead])
async def list_categories(session: AsyncSession = Depends(get_session)):
    query = select(Category).where(col(Category.is_active).is_(True)).order_by(col(Category.name))
    return (await session.exec(query)).all()
