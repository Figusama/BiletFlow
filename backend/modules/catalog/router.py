import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import case, func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from backend.core.paging import like_pattern, page
from backend.modules.admin.router import require_admin
from backend.modules.catalog.schemas import (
    AdminVenue, CategoryCreate, CategoryPublic, CategoryUpdate, LayoutCreate, LayoutPublic, VenueCreate, VenuePublic, VenueUpdate,
)
from backend.modules.events.models import categories, events
from backend.modules.events.schemas import EventLifecycleStatus
from backend.modules.users.user_model import users
from backend.modules.venues.models import venue_layouts, venue_rows, venue_seats, venue_sections, venues
from database.database import get_session

router = APIRouter(tags=["catalog"])


def category_to_public(category: categories) -> CategoryPublic:
    return CategoryPublic(id=category.id, name=category.name, slug=category.slug, is_active=category.is_active)


def venue_to_public(session: Session, venue: venues) -> VenuePublic:
    layouts = session.exec(select(venue_layouts).where(venue_layouts.venue_id == venue.id).order_by(venue_layouts.name, venue_layouts.version)).all()
    counts = dict(session.exec(
        select(venue_sections.layout_id, func.count(venue_seats.id))
        .join(venue_rows, venue_rows.section_id == venue_sections.id)
        .join(venue_seats, venue_seats.row_id == venue_rows.id)
        .where(venue_sections.layout_id.in_([layout.id for layout in layouts] or [uuid.uuid4()]))
        .group_by(venue_sections.layout_id)
    ).all())
    return VenuePublic(id=venue.id, name=venue.name, address=venue.address, city=venue.city, timezone=venue.timezone, max_capacity=venue.max_capacity,
                       layouts=[LayoutPublic(id=l.id, name=l.name, version=l.version, is_active=l.is_active, seats=counts.get(l.id, 0)) for l in layouts])


@router.get("/categories", response_model=list[CategoryPublic])
def list_categories(session: Session = Depends(get_session)):
    rows = session.exec(select(categories).where(categories.is_active.is_(True)).order_by(categories.name)).all()
    return [category_to_public(c) for c in rows]


@router.get("/venues", response_model=list[VenuePublic])
def list_venues(city: str | None = None, session: Session = Depends(get_session)):
    query = select(venues).order_by(venues.city, venues.name)
    if city:
        query = query.where(venues.city.ilike(city.strip()))
    return [venue_to_public(session, v) for v in session.exec(query).all()]


@router.get("/venues/{venue_id}", response_model=VenuePublic)
def read_venue(venue_id: uuid.UUID, session: Session = Depends(get_session)):
    venue = session.get(venues, venue_id)
    if venue is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Venue not found")
    return venue_to_public(session, venue)


@router.get("/admin/categories", response_model=list[CategoryPublic])
def admin_list_categories(session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    return [category_to_public(c) for c in session.exec(select(categories).order_by(categories.name)).all()]


@router.post("/admin/categories", response_model=CategoryPublic, status_code=status.HTTP_201_CREATED)
def create_category(data: CategoryCreate, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    category = categories(name=data.name.strip(), slug=data.slug)
    session.add(category)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Category slug already exists")
    session.refresh(category)
    return category_to_public(category)


@router.patch("/admin/categories/{category_id}", response_model=CategoryPublic)
def update_category(category_id: uuid.UUID, data: CategoryUpdate, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    category = session.get(categories, category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(category, key, value.strip() if isinstance(value, str) else value)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category_to_public(category)


@router.post("/admin/venues", response_model=VenuePublic, status_code=status.HTTP_201_CREATED)
def create_venue(data: VenueCreate, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    try:
        ZoneInfo(data.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown timezone")
    venue = venues(name=data.name.strip(), address=data.address.strip(), city=data.city.strip(), timezone=data.timezone, max_capacity=data.max_capacity)
    session.add(venue)
    session.commit()
    session.refresh(venue)
    return venue_to_public(session, venue)


def admin_venues(session: Session, rows: list[venues]) -> list[AdminVenue]:
    active = case((events.status == EventLifecycleStatus.PUBLISHED, 1))
    counts = {venue_id: (total, published) for venue_id, total, published in session.exec(
        select(events.venue_id, func.count(), func.count(active)).where(events.venue_id.in_([v.id for v in rows])).group_by(events.venue_id)).all()}
    result = []
    for venue in rows:
        total, published = counts.get(venue.id, (0, 0))
        result.append(AdminVenue(**venue_to_public(session, venue).model_dump(), events_count=total, active_events_count=published))
    return result


@router.get("/admin/venues", response_model=list[AdminVenue])
def admin_list_venues(response: Response, q: str | None = None, city: str | None = None, limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
                      session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    query = select(venues)
    if q and q.strip():
        pattern = like_pattern(q)
        query = query.where(or_(venues.name.ilike(pattern), venues.address.ilike(pattern)))
    if city and city.strip():
        query = query.where(venues.city.ilike(like_pattern(city)))
    return admin_venues(session, page(session, response, query.order_by(venues.city, venues.name, venues.id), limit, offset))


@router.patch("/admin/venues/{venue_id}", response_model=AdminVenue)
def update_venue(venue_id: uuid.UUID, data: VenueUpdate, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    venue = session.exec(select(venues).where(venues.id == venue_id).with_for_update()).first()
    if venue is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Venue not found")
    changes = {key: value.strip() if isinstance(value, str) else value for key, value in data.model_dump(exclude_unset=True, exclude_none=True).items()}
    if any(value == "" for value in changes.values()):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Value is required")
    moved = any(key != "max_capacity" and getattr(venue, key) != value for key, value in changes.items())
    open_events = select(events.id).where(events.venue_id == venue.id, events.status == EventLifecycleStatus.PUBLISHED).limit(1)
    if moved and session.exec(open_events).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "The venue has published events; change it through an event change request")
    if "max_capacity" in changes:
        used = session.exec(select(func.max(events.ga_capacity)).where(events.venue_id == venue.id, events.status.in_(
            (EventLifecycleStatus.DRAFT, EventLifecycleStatus.PUBLISHED)))).one() or 0
        seats = max((layout.seats for layout in venue_to_public(session, venue).layouts), default=0)
        if changes["max_capacity"] < max(used, seats):
            raise HTTPException(status.HTTP_409_CONFLICT, f"Capacity is already used by events or layouts: {max(used, seats)}")
    for key, value in changes.items():
        setattr(venue, key, value)
    session.add(venue)
    session.commit()
    session.refresh(venue)
    return admin_venues(session, [venue])[0]


@router.post("/admin/venues/{venue_id}/layouts", response_model=VenuePublic, status_code=status.HTTP_201_CREATED)
def create_layout(venue_id: uuid.UUID, data: LayoutCreate, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    venue = session.exec(select(venues).where(venues.id == venue_id).with_for_update()).first()
    if venue is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Venue not found")
    total = sum(row.seats for section in data.sections for row in section.rows)
    if total > venue.max_capacity:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Layout has {total} seats, venue capacity is {venue.max_capacity}")
    section_names = [s.name for s in data.sections]
    if len(set(section_names)) != len(section_names):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Section names must be unique")
    version = (session.exec(select(func.max(venue_layouts.version)).where(venue_layouts.venue_id == venue.id, venue_layouts.name == data.name)).one() or 0) + 1
    layout = venue_layouts(venue_id=venue.id, name=data.name.strip(), version=version)
    session.add(layout)
    session.flush()
    for section_spec in data.sections:
        labels = [r.label for r in section_spec.rows]
        if len(set(labels)) != len(labels):
            session.rollback()
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Row labels must be unique in section {section_spec.name}")
        section = venue_sections(layout_id=layout.id, name=section_spec.name)
        session.add(section)
        session.flush()
        for row_spec in section_spec.rows:
            row = venue_rows(section_id=section.id, label=row_spec.label)
            session.add(row)
            session.flush()
            accessible = set(row_spec.accessible_seats)
            for number in range(1, row_spec.seats + 1):
                session.add(venue_seats(row_id=row.id, seat_number=str(number), is_accessible=number in accessible))
    session.commit()
    return venue_to_public(session, venue)
