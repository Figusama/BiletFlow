import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from pydantic import AwareDatetime
from sqlalchemy import delete as sa_delete, exists, or_
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.core.config import MAX_APPLICATION_IMAGES, PUBLIC_API_URL
from backend.core.media import media_url, save_image
from backend.modules.audit import service as audit
from backend.modules.auth.dependencies import get_current_user, get_optional_user

from backend.modules.events.access import get_event_or_404, event_roles, require_organizer, can_view_event

from backend.modules.events.calendar import build_ics, google_calendar_url
from backend.modules.events.models import categories, event_applications, event_categories, event_images, events, event_seats
from backend.modules.orders.models import orders
from backend.modules.orders.schemas import OrderStatus
from backend.modules.events.schemas import ( EventCategory, EventImage, EventLifecycleStatus, EventPublic, EventUpdate,
                                            SeatingMode, Visibility, EventManage)

from backend.modules.payments.activation import paid_sales_active
from backend.modules.tickets.models import ticket_types, tickets
from backend.modules.tickets.schemas import TicketKind
from backend.modules.users.user_model import users, event_user_roles, Role, EventRole
from backend.modules.venues.models import venues, venue_layouts
from database.database import get_session
from datetime import datetime, timezone
from sqlalchemy.exc import IntegrityError
import secrets

router = APIRouter(prefix="/events", tags=["events"])


DERIVED_FIELDS = {"venue_name", "venue_address", "venue_city", "calendar_ics_url", "google_calendar_url", "categories", "images", "cover_image_url"}
REQUIRED_FIELDS = [
    "title", "description", "venue_id", "starts_at", "ends_at", "timezone", "visibility", "seating_mode", "responsible_name", "responsible_email", "responsible_phone"
]
REQUIRED_DOCS = {"ORGANIZER_RULES", "TICKET_SALES_FINANCIAL_TERMS"}


def to_public(session: Session, event: events) -> EventPublic:
    venue = session.get(venues, event.venue_id)
    category_rows = session.exec(
        select(categories).join(event_categories, event_categories.category_id == categories.id).where(event_categories.event_id == event.id).order_by(categories.name)
    ).all()
    image_rows = session.exec(select(event_images).where(event_images.event_id == event.id).order_by(event_images.position)).all()
    images = [EventImage(id=i.id, position=i.position, url=media_url(i.storage_key)) for i in image_rows]
    return EventPublic(
        **event.model_dump(include=set(EventPublic.model_fields) - DERIVED_FIELDS),
        categories=[EventCategory(id=c.id, name=c.name, slug=c.slug) for c in category_rows],
        images=images,
        cover_image_url=images[0].url if images else None,
        venue_name=venue.name if venue else None,
        venue_address=venue.address if venue else None,
        venue_city=venue.city if venue else None,
        calendar_ics_url=f"{PUBLIC_API_URL}/events/{event.id}/calendar.ics",
        google_calendar_url=google_calendar_url(event, venue),
    )


def find_event(session: Session, ref: str) -> events:
    try:
        event = session.get(events, uuid.UUID(ref))
    except ValueError:
        event = session.exec(select(events).where(or_(events.slug == ref, events.public_id == ref))).first()
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    return event


def current_organizer_document_versions() -> dict[str, str]:
    raise HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "Organizer document version registry is not configured",
    )


def ever_issued(session: Session, event_id: uuid.UUID) -> bool:
    return session.exec(select(tickets.id).where(tickets.event_id == event_id).limit(1)).first() is not None

@router.get("/", response_model=list[EventPublic])
def list_events(q: str | None = Query(default=None, max_length=200), city: str | None = None, category: str | None = None,
                date_from: AwareDatetime | None = None, date_to: AwareDatetime | None = None, free_only: bool = False,
                limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0), session: Session = Depends(get_session)):
    now = db_now(session)
    query = select(events).where(events.status == EventLifecycleStatus.PUBLISHED, events.visibility == Visibility.PUBLIC,
                                 events.is_suspended.is_(False), events.ends_at > now)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        query = query.where(or_(events.title.ilike(pattern), events.description.ilike(pattern)))
    if city and city.strip():
        query = query.where(exists().where(venues.id == events.venue_id, venues.city.ilike(city.strip())))
    if category:
        query = query.where(exists().where(event_categories.event_id == events.id, event_categories.category_id == categories.id,
                                           categories.slug == category, categories.is_active.is_(True)))
    if date_from:
        query = query.where(events.ends_at >= date_from)
    if date_to:
        query = query.where(events.starts_at <= date_to)
    if free_only:
        query = query.where(~exists().where(ticket_types.event_id == events.id, ticket_types.is_active.is_(True), ticket_types.kind == TicketKind.PAID))
    rows = session.exec(query.order_by(events.starts_at, events.id).limit(limit).offset(offset)).all()
    return [to_public(session, event) for event in rows]


@router.get("/mine", response_model=list[EventPublic])
def my_events(session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    rows = session.exec(
        select(events).join(event_user_roles, event_user_roles.event_id == events.id).where(event_user_roles.user_id == current_user.id).order_by(events.starts_at)
    ).all()
    return [to_public(session, event) for event in rows]


@router.get("/{event_ref}", response_model=EventPublic)
def read_event(event_ref: str, session: Session = Depends(get_session), viewer: users | None = Depends(get_optional_user)):
    event = find_event(session, event_ref)
    if not can_view_event(session, event, viewer):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    return to_public(session, event)


@router.get("/{event_id}/manage", response_model=EventPublic)
def read_event_for_staff(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event = get_event_or_404(session, event_id)
    roles = event_roles(session, event_id, current_user)
    is_admin = current_user.personal_role == Role.PLATFORM_ADMIN
    if not is_admin and not roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not manage this event"
        )

    sees_responsible = is_admin or EventRole.ORGANIZER in roles
    return EventManage(
        **to_public(session, event).model_dump(),
        responsible_name=event.responsible_name if sees_responsible else None,
        responsible_email=event.responsible_email if sees_responsible else None,
        responsible_phone=event.responsible_phone if sees_responsible else None,
        tickets_issued=ever_issued(session, event.id)
    )


@router.patch("/{event_id}", response_model=EventPublic)
def update_event(event_id: uuid.UUID, data: EventUpdate, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    changes = data.model_dump(exclude_unset=True)
    if "ga_capacity" in changes:
        if event.status != EventLifecycleStatus.DRAFT:
            raise HTTPException(status.HTTP_409_CONFLICT, "Capacity of a published event changes only through an Event Change Request")
        if event.seating_mode != SeatingMode.GENERAL_ADMISSION:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Capacity is derived from seats for assigned seating")
        venue = session.get(venues, event.venue_id)
        if changes["ga_capacity"] is None or changes["ga_capacity"] <= 0 or changes["ga_capacity"] > venue.max_capacity:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Capacity must be between 1 and {venue.max_capacity}")
    if "description" in changes and changes["description"] is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Description cannot be empty")
    if "visibility" in changes and changes["visibility"] is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                            detail="Visibility cannot be empty"
                            )
    if "refund_policy" in changes:
        policy = changes["refund_policy"] or {}
        hours = policy.get("self_service_refund_until_hours_before_start")
        if hours is not None and (not isinstance(hours, int) or isinstance(hours, bool) or hours < 0):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid refund policy")
        if session.exec(select(orders.id).where(orders.event_id == event.id, orders.status == OrderStatus.CONFIRMED).limit(1)).first():
            raise HTTPException(status.HTTP_409_CONFLICT, "Refund policy changes after the first sale need an Event Change Request")
        changes["refund_policy"] = policy
    for key, value in changes.items():
        setattr(event, key, value)
    session.add(event)
    if event.status != EventLifecycleStatus.DRAFT:
        audit.record(session, action="EVENT_DETAILS_UPDATED", entity_type="EVENT", entity_id=event.id, event_id=event.id, actor_user_id=current_user.id,
                     details={"fields": sorted(changes)})
    session.commit()
    session.refresh(event)
    return to_public(session, event)


@router.put("/{event_id}/categories", response_model=EventPublic)
def set_categories(event_id: uuid.UUID, category_ids: list[uuid.UUID], session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    unique_ids = list(dict.fromkeys(category_ids))
    if not unique_ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "At least one category is required")
    if len(session.exec(select(categories.id).where(categories.id.in_(unique_ids), categories.is_active.is_(True))).all()) != len(unique_ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown or inactive category")
    session.exec(sa_delete(event_categories).where(event_categories.event_id == event.id))
    for category_id in unique_ids:
        session.add(event_categories(event_id=event.id, category_id=category_id))
    session.commit()
    return to_public(session, event)


@router.post("/{event_id}/images", response_model=EventPublic, status_code=status.HTTP_201_CREATED)
def add_image(event_id: uuid.UUID, file: UploadFile = File(...), session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    positions = session.exec(select(event_images.position).where(event_images.event_id == event.id)).all()
    if len(positions) >= MAX_APPLICATION_IMAGES:
        raise HTTPException(status.HTTP_409_CONFLICT, f"At most {MAX_APPLICATION_IMAGES} images are allowed")
    storage_key = save_image(file, f"events/{event.id}")
    session.add(event_images(event_id=event.id, storage_key=storage_key, position=max(positions) + 1 if positions else 0))
    session.commit()
    return to_public(session, event)


@router.delete("/{event_id}/images/{image_id}", response_model=EventPublic)
def remove_image(event_id: uuid.UUID, image_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    if current_user.personal_role != Role.PLATFORM_ADMIN:
        require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    image = session.get(event_images, image_id)
    if image is None or image.event_id != event.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")
    session.delete(image)
    session.commit()
    return to_public(session, event)


@router.post("/{event_id}/publish", response_model=EventPublic)
def publish_event(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    if event.status != EventLifecycleStatus.DRAFT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only draft events can be published")
    now = db_now(session)
    problems = []
    if as_aware(event.ends_at) <= now:
        problems.append("Event has already ended")
    if as_aware(event.ends_at) <= as_aware(event.starts_at):
        problems.append("Event end must be after start")
    if not event.title or not event.description:
        problems.append("Title and description are required")
    types = session.exec(select(ticket_types).where(ticket_types.event_id == event.id)).all()
    if not any(t.is_active for t in types):
        problems.append("At least one active ticket type is required")
    for ticket_type in types:
        if as_aware(ticket_type.sales_end_at) > as_aware(event.ends_at):
            problems.append(f"Sales of '{ticket_type.name}' must end no later than the event")
    if event.seating_mode == SeatingMode.GENERAL_ADMISSION:
        venue = session.get(venues, event.venue_id)
        if not event.ga_capacity or venue is None or event.ga_capacity > venue.max_capacity:
            problems.append("GA capacity must be positive and within venue maximum")
    else:
        # INTEGRATION REQUIRED: verify enabled assigned seats with assigned types
        # against the actual event_seats model and publish readiness contract.
        problems.append("Assigned seating publish readiness validator is not yet integrated")
    if session.exec(select(event_categories.category_id).where(event_categories.event_id == event.id).limit(1)).first() is None:
        problems.append("At least one category is required")
    if session.exec(select(event_images.id).where(event_images.event_id == event.id).limit(1)).first() is None:
        problems.append("At least one image is required")
    if not event.public_contact_name or not event.public_contact_email or not event.public_contact_phone:
        problems.append("Public contact information is required")
    if any(t.kind == TicketKind.PAID for t in types) and not paid_sales_active(session, event.id):
        problems.append("Paid Sales Activation must be ACTIVE before publishing paid tickets")
    if problems:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, {"code": "not_ready", "problems": problems})
    event.status = EventLifecycleStatus.PUBLISHED
    event.published_at = now
    session.add(event)
    audit.record(session, action="EVENT_PUBLISHED", entity_type="EVENT", entity_id=event.id, event_id=event.id, actor_user_id=current_user.id)
    session.commit()
    session.refresh(event)
    return to_public(session, event)


@router.post("/{event_id}/unpublish", response_model=EventPublic)
def unpublish_event(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    if event.status != EventLifecycleStatus.PUBLISHED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only published events can be unpublished")
    if ever_issued(session, event.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Tickets were already issued; use the cancellation workflow")
    event.status = EventLifecycleStatus.DRAFT
    event.published_at = None
    session.add(event)
    audit.record(session, action="EVENT_UNPUBLISHED", entity_type="EVENT", entity_id=event.id, event_id=event.id, actor_user_id=current_user.id)
    session.commit()
    session.refresh(event)
    return to_public(session, event)


@router.get("/{event_id}/calendar.ics")
def calendar_ics(event_id: uuid.UUID, session: Session = Depends(get_session), viewer: users | None = Depends(get_optional_user)):
    event = get_event_or_404(session, event_id)
    if not can_view_event(session, event, viewer):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    body = build_ics(event, session.get(venues, event.venue_id))
    return Response(content=body, media_type="text/calendar; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{event.slug}.ics"'})