import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from backend.modules.admin.router import require_admin
from backend.modules.catalog.schemas import CategoryCreate, CategoryPublic, CategoryUpdate, LayoutCreate, LayoutPublic, VenueCreate, VenuePublic
from backend.modules.events.models import categories
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
