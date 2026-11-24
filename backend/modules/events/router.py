import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import or_
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.core.config import PUBLIC_API_URL
from backend.modules.audit import service as audit
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.access import get_event_or_404, is_publicly_viewable, require_organizer, event_roles
from backend.modules.events.calendar import build_ics, google_calendar_url
from backend.modules.events.models import events, event_applications
from backend.modules.events.schemas import EventLifecycleStatus, EventPublic, EventUpdate, SeatingMode, Visibility, CreateEvent, EventStatus
from backend.modules.payments.activation import paid_sales_active
from backend.modules.tickets.models import ticket_types, tickets
from backend.modules.tickets.schemas import TicketKind
from backend.modules.users.user_model import users, event_user_roles, Role
from backend.modules.venues.models import venues
from database.database import get_session
from datetime import datetime, timezone
import secrets

router = APIRouter(prefix="/events", tags=["events"])


def to_public(session: Session, event: events) -> EventPublic:
    venue = session.get(venues, event.venue_id)
    return EventPublic(
        **event.model_dump(include=set(EventPublic.model_fields) - {"venue_name", "venue_address", "venue_city", "calendar_ics_url", "google_calendar_url"}),
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

def generate_application_number(prefix : str = "APP"):
    year = datetime.now(timezone.utc).year
    random_part = secrets.token_hex(3).upper()
    return f"{prefix}-{year}-{random_part}"

def ever_issued(session: Session, event_id: uuid.UUID) -> bool:
    return session.exec(select(tickets.id).where(tickets.event_id == event_id).limit(1)).first() is not None

@router.post("/create", response_model=CreateEvent)
def create_event(data : CreateEvent, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    application = event_applications(**data.model_dump(),
                                    applicant_user_id=current_user.id,
                                    application_number=generate_application_number(),
                                    status=EventStatus.DRAFT,
                                    )
    session.add(application)
    session.commit()
    session.refresh(application)

    return application



@router.get("/", response_model=list[EventPublic])
def list_events(session: Session = Depends(get_session)):
    now = db_now(session)
    rows = session.exec(
        select(events)
        .where(events.status == EventLifecycleStatus.PUBLISHED, events.visibility == Visibility.PUBLIC, events.ends_at > now)
        .order_by(events.starts_at)
    ).all()
    return [to_public(session, event) for event in rows]


@router.get("/mine", response_model=list[EventPublic])
def my_events(session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    rows = session.exec(
        select(events).join(event_user_roles, event_user_roles.event_id == events.id).where(event_user_roles.user_id == current_user.id).order_by(events.starts_at)
    ).all()
    return [to_public(session, event) for event in rows]


@router.get("/{event_ref}", response_model=EventPublic)
def read_event(event_ref: str, session: Session = Depends(get_session)):
    event = find_event(session, event_ref)
    if not is_publicly_viewable(event):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    return to_public(session, event)


@router.get("/{event_id}/manage", response_model=EventPublic)
def read_event_for_staff(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event = get_event_or_404(session, event_id)
    if current_user.personal_role != Role.PLATFORM_ADMIN and not event_roles(session, event_id, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not manage this event")
    return to_public(session, event)


@router.patch("/{event_id}", response_model=EventPublic)
def update_event(event_id: uuid.UUID, data: EventUpdate, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    changes = data.model_dump(exclude_unset=True)
    if "ga_capacity" in changes:
        if event.status != EventLifecycleStatus.DRAFT:
            raise HTTPException(status.HTTP_409_CONFLICT, "Capacity of a published event changes only through an Event Change Request")
        if event.seating_mode != SeatingMode.GENERAL_ADMISSION:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Capacity is derived from seats for assigned seating")
        venue = session.get(venues, event.venue_id)
        if changes["ga_capacity"] is None or changes["ga_capacity"] <= 0 or changes["ga_capacity"] > venue.max_capacity:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Capacity must be between 1 and {venue.max_capacity}")
    for key, value in changes.items():
        setattr(event, key, value)
    session.add(event)
    session.commit()
    session.refresh(event)
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
    if event.seating_mode == SeatingMode.GENERAL_ADMISSION and not event.ga_capacity:
        problems.append("General admission capacity is required")
    if any(t.kind == TicketKind.PAID for t in types) and not paid_sales_active(session, event.id):
        problems.append("Paid Sales Activation must be ACTIVE before publishing paid tickets")
    if problems:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "not_ready", "problems": problems})
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
def calendar_ics(event_id: uuid.UUID, session: Session = Depends(get_session)):
    event = get_event_or_404(session, event_id)
    if not is_publicly_viewable(event):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    body = build_ics(event, session.get(venues, event.venue_id))
    return Response(content=body, media_type="text/calendar; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{event.slug}.ics"'})
