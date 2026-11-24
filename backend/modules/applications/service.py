import re
import secrets
import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import delete, func
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.core.config import ORGANIZER_RULES_VERSION, TICKET_SALES_TERMS_VERSION
from backend.core.media import media_url
from backend.modules.applications.schemas import AgreementPublic, AgreementType, ApplicationPublic, CategoryRef, ImagePublic
from backend.modules.audit import service as audit
from backend.modules.events.models import (categories, event_application_agreements, event_application_categories, event_application_images,
                                           event_applications, event_categories, event_images, event_seats, events)
from backend.modules.events.router import generate_application_number
from backend.modules.events.schemas import EventLifecycleStatus, EventStatus, SeatingMode
from backend.modules.users.user_model import EventRole, Role, event_user_roles, users
from backend.modules.venues.models import venue_layouts, venue_rows, venue_seats, venue_sections, venues

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def current_versions() -> dict[str, str]:
    return {AgreementType.ORGANIZER_RULES.value: ORGANIZER_RULES_VERSION, AgreementType.TICKET_SALES_FINANCIAL_TERMS.value: TICKET_SALES_TERMS_VERSION}


def generate_number(prefix: str, length: int = 8) -> str:
    return prefix + "".join(secrets.choice(ALPHABET) for _ in range(length))


def slugify(title: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60].strip("-")
    return f"{base or 'event'}-{secrets.token_hex(3)}"


def get_application(session: Session, application_id: uuid.UUID, for_update: bool = False) -> event_applications:
    query = select(event_applications).where(event_applications.id == application_id)
    if for_update:
        query = query.with_for_update().execution_options(populate_existing=True)
    application = session.exec(query).first()
    if application is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")
    return application


def get_own_application(session: Session, application_id: uuid.UUID, user: users, for_update: bool = False) -> event_applications:
    application = get_application(session, application_id, for_update)
    if application.applicant_user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")
    return application


def get_readable_application(session: Session, application_id: uuid.UUID, user: users) -> event_applications:
    application = get_application(session, application_id)
    if application.applicant_user_id != user.id and user.personal_role != Role.PLATFORM_ADMIN:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")
    return application


def ensure_draft(application: event_applications) -> None:
    if application.status != EventStatus.DRAFT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only draft applications can be changed")


def application_images(session: Session, application_id: uuid.UUID) -> list[event_application_images]:
    return list(session.exec(select(event_application_images).where(event_application_images.application_id == application_id).order_by(event_application_images.position)).all())


def application_categories(session: Session, application_id: uuid.UUID) -> list[categories]:
    return list(session.exec(
        select(categories).join(event_application_categories, event_application_categories.category_id == categories.id)
        .where(event_application_categories.application_id == application_id).order_by(categories.name)
    ).all())


def application_agreements(session: Session, application_id: uuid.UUID) -> list[event_application_agreements]:
    return list(session.exec(select(event_application_agreements).where(event_application_agreements.application_id == application_id)).all())


def valid_timezone(name: str | None) -> bool:
    if not name:
        return False
    try:
        ZoneInfo(name)
        return True
    except (ZoneInfoNotFoundError, ValueError):
        return False


def missing_for_submit(session: Session, application: event_applications, now=None) -> list[str]:
    missing = []
    if not (application.title or "").strip():
        missing.append("title")
    if not (application.description or "").strip():
        missing.append("description")
    if not application_categories(session, application.id):
        missing.append("categories")
    if application.venue_id is None:
        missing.append("venue")
    if application.starts_at is None or application.ends_at is None:
        missing.append("dates")
    elif as_aware(application.ends_at) <= as_aware(application.starts_at):
        missing.append("ends_after_start")
    elif now is not None and as_aware(application.starts_at) <= now:
        missing.append("start_in_future")
    if not valid_timezone(application.timezone):
        missing.append("timezone")
    if application.visibility is None:
        missing.append("visibility")
    if application.seating_mode is None:
        missing.append("seating_mode")
    elif application.seating_mode == SeatingMode.ASSIGNED_SEATING and application.venue_layout_id is None:
        missing.append("venue_layout")
    for field in ("responsible_name", "responsible_email", "responsible_phone"):
        if not (getattr(application, field) or "").strip():
            missing.append(field)
    if not application_images(session, application.id):
        missing.append("images")
    accepted = {a.document_type: a.document_version for a in application_agreements(session, application.id)}
    for document_type, version in current_versions().items():
        if accepted.get(document_type) != version:
            missing.append(f"agreement:{document_type}")
    return missing


def to_public(session: Session, application: event_applications) -> ApplicationPublic:
    versions = current_versions()
    event_id = session.exec(select(events.id).where(events.source_application_id == application.id)).first()
    return ApplicationPublic(
        **application.model_dump(include=set(ApplicationPublic.model_fields) - {"categories", "images", "agreements", "event_id", "missing_for_submit"}),
        categories=[CategoryRef(id=c.id, name=c.name, slug=c.slug) for c in application_categories(session, application.id)],
        images=[ImagePublic(id=i.id, position=i.position, url=media_url(i.storage_key)) for i in application_images(session, application.id)],
        agreements=[AgreementPublic(document_type=a.document_type, document_version=a.document_version, accepted_at=a.accepted_at,
                                    is_current=versions.get(a.document_type) == a.document_version) for a in application_agreements(session, application.id)],
        event_id=event_id,
        missing_for_submit=missing_for_submit(session, application, db_now(session)) if application.status == EventStatus.DRAFT else [],
    )


def apply_venue(session: Session, application: event_applications, venue_id: uuid.UUID | None) -> None:
    if venue_id is None:
        application.venue_id = None
        application.venue_name_snapshot = application.venue_address_snapshot = application.venue_city_snapshot = None
        application.venue_layout_id = None
        return
    venue = session.get(venues, venue_id)
    if venue is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Venue not found")
    if application.venue_id != venue.id:
        application.venue_layout_id = None
    application.venue_id = venue.id
    application.venue_name_snapshot = venue.name
    application.venue_address_snapshot = venue.address
    application.venue_city_snapshot = venue.city
    if not application.timezone:
        application.timezone = venue.timezone


def apply_layout(session: Session, application: event_applications, layout_id: uuid.UUID | None) -> None:
    if layout_id is None:
        application.venue_layout_id = None
        return
    layout = session.get(venue_layouts, layout_id)
    if layout is None or layout.venue_id != application.venue_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Layout does not belong to the selected venue")
    if not layout.is_active:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Layout is not active")
    application.venue_layout_id = layout.id


def replace_categories(session: Session, application_id: uuid.UUID, category_ids: list[uuid.UUID]) -> None:
    unique_ids = list(dict.fromkeys(category_ids))
    if unique_ids:
        found = session.exec(select(categories.id).where(categories.id.in_(unique_ids), categories.is_active.is_(True))).all()
        if len(found) != len(unique_ids):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown or inactive category")
    session.exec(delete(event_application_categories).where(event_application_categories.application_id == application_id))
    for category_id in unique_ids:
        session.add(event_application_categories(application_id=application_id, category_id=category_id))


def apply_changes(session: Session, application: event_applications, changes: dict) -> None:
    category_ids = changes.pop("category_ids", None)
    if "venue_id" in changes:
        apply_venue(session, application, changes.pop("venue_id"))
    if "venue_layout_id" in changes:
        apply_layout(session, application, changes.pop("venue_layout_id"))
    if "timezone" in changes and changes["timezone"] is not None and not valid_timezone(changes["timezone"]):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown timezone")
    if changes.get("seating_mode") == SeatingMode.GENERAL_ADMISSION:
        application.venue_layout_id = None
    for key, value in changes.items():
        if key == "intends_paid_sales" and value is None:
            continue
        setattr(application, key, value.strip() if isinstance(value, str) else value)
    starts_at, ends_at = application.starts_at, application.ends_at
    if starts_at and ends_at and as_aware(ends_at) <= as_aware(starts_at):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Event end must be after start")
    if category_ids is not None:
        replace_categories(session, application.id, category_ids)


def new_application(session: Session, user: users) -> event_applications:
    application = event_applications(application_number=generate_application_number(), applicant_user_id=user.id)
    session.add(application)
    session.flush()
    return application


def copy_images(session: Session, source: list, target_application_id: uuid.UUID) -> None:
    for image in source:
        session.add(event_application_images(application_id=target_application_id, storage_key=image.storage_key, position=image.position))


def prefilled_draft(session: Session, user: users, *, title, description, venue_id, venue_layout_id, timezone, visibility, seating_mode,
                    responsible_name, responsible_email, responsible_phone, intends_paid_sales, category_ids, images) -> event_applications:
    application = new_application(session, user)
    application.title = title
    application.description = description
    application.timezone = timezone
    application.visibility = visibility
    application.seating_mode = seating_mode
    application.responsible_name = responsible_name
    application.responsible_email = responsible_email
    application.responsible_phone = responsible_phone
    application.intends_paid_sales = intends_paid_sales
    if venue_id:
        apply_venue(session, application, venue_id)
        layout = session.get(venue_layouts, venue_layout_id) if venue_layout_id else None
        application.venue_layout_id = layout.id if layout and layout.is_active and layout.venue_id == venue_id else None
    active = set(session.exec(select(categories.id).where(categories.id.in_(category_ids or [uuid.uuid4()]), categories.is_active.is_(True))).all())
    for category_id in category_ids:
        if category_id in active:
            session.add(event_application_categories(application_id=application.id, category_id=category_id))
    copy_images(session, images, application.id)
    session.add(application)
    return application


def generate_event_seats(session: Session, event_id: uuid.UUID, layout_id: uuid.UUID) -> int:
    seat_ids = session.exec(
        select(venue_seats.id).join(venue_rows, venue_rows.id == venue_seats.row_id).join(venue_sections, venue_sections.id == venue_rows.section_id)
        .where(venue_sections.layout_id == layout_id)
    ).all()
    for seat_id in seat_ids:
        session.add(event_seats(event_id=event_id, seat_id=seat_id))
    return len(seat_ids)


def approve(session: Session, application: event_applications, admin: users, review_comment: str | None) -> events:
    now = db_now(session)
    problems = [p for p in missing_for_submit(session, application, now) if not p.startswith("agreement:")]
    if problems:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "incomplete_application", "problems": problems})
    venue = session.get(venues, application.venue_id)
    if application.seating_mode == SeatingMode.ASSIGNED_SEATING:
        layout = session.get(venue_layouts, application.venue_layout_id)
        if layout is None or layout.venue_id != venue.id or not layout.is_active:
            raise HTTPException(status.HTTP_409_CONFLICT, "Layout is no longer available")
    event = events(
        public_id=generate_number("BF-E-"),
        slug=slugify(application.title),
        source_application_id=application.id,
        title=application.title,
        description=application.description,
        venue_id=venue.id,
        venue_layout_id=application.venue_layout_id if application.seating_mode == SeatingMode.ASSIGNED_SEATING else None,
        starts_at=application.starts_at,
        ends_at=application.ends_at,
        timezone=application.timezone,
        visibility=application.visibility,
        seating_mode=application.seating_mode,
        responsible_name=application.responsible_name,
        responsible_email=application.responsible_email,
        responsible_phone=application.responsible_phone,
        refund_policy={},
        status=EventLifecycleStatus.DRAFT,
        ga_capacity=venue.max_capacity if application.seating_mode == SeatingMode.GENERAL_ADMISSION else None,
    )
    session.add(event)
    session.flush()
    for category in application_categories(session, application.id):
        session.add(event_categories(event_id=event.id, category_id=category.id))
    for image in application_images(session, application.id):
        session.add(event_images(event_id=event.id, storage_key=image.storage_key, position=image.position))
    if event.seating_mode == SeatingMode.ASSIGNED_SEATING:
        if generate_event_seats(session, event.id, event.venue_layout_id) == 0:
            raise HTTPException(status.HTTP_409_CONFLICT, "Layout has no seats")
    session.add(event_user_roles(event_id=event.id, user_id=application.applicant_user_id, event_role=EventRole.ORGANIZER))
    application.status = EventStatus.APPROVED
    application.reviewed_by_user_id = admin.id
    application.reviewed_at = now
    application.review_comment = review_comment
    session.add(application)
    audit.record(session, action="EVENT_APPLICATION_APPROVED", entity_type="EVENT_APPLICATION", entity_id=application.id, event_id=event.id,
                 actor_user_id=admin.id, details={"application_number": application.application_number, "event_public_id": event.public_id})
    return event


def next_image_position(session: Session, application_id: uuid.UUID) -> int:
    current = session.exec(select(func.max(event_application_images.position)).where(event_application_images.application_id == application_id)).one()
    return 0 if current is None else current + 1
