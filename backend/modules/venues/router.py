import uuid

from fastapi import APIRouter, Depends
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.errors import not_found
from db.session import get_session
from modules.venues.models import Venue, VenueLayout
from modules.venues.schemas import VenueDetailRead, VenueRead

router = APIRouter(prefix="/venues", tags=["catalog"])


@router.get("", response_model=list[VenueRead])
async def list_venues(city: str | None = None, session: AsyncSession = Depends(get_session)):
    query = select(Venue).order_by(col(Venue.city), col(Venue.name))
    if city:
        query = query.where(col(Venue.city).ilike(city))
    return (await session.exec(query)).all()


@router.get("/{venue_id}", response_model=VenueDetailRead)
async def get_venue(venue_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    venue = await session.get(Venue, venue_id)
    if venue is None:
        raise not_found("Venue")
    layouts = (
        await session.exec(
            select(VenueLayout).where(VenueLayout.venue_id == venue_id, col(VenueLayout.is_active).is_(True))
        )
    ).all()
    return VenueDetailRead(**venue.model_dump(), layouts=[layout.model_dump() for layout in layouts])
