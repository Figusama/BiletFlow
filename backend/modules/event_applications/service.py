import secrets
import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import BackgroundTasks, UploadFile
from slugify import slugify
from sqlalchemy import delete, func, update
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.config import settings
from core.email import send_email
from core.errors import AppError, not_found
from core.ids import public_id
from core.storage import ImageRead, file_url, save_image
from core.timeutils import as_utc, utcnow
from modules.categories.models import Category
from modules.categories.schemas import CategoryRead
from modules.event_applications.models import (
    ApplicationStatus,
    EventApplication,
    EventApplicationCategory,
    EventApplicationImage,
)
from modules.event_applications.schemas import ApplicationRead, ApplicationWrite
from modules.events.models import Event, EventCategory, EventImage, SeatingMode
from modules.users.models import EventRole, EventUserRole, User
from modules.venues.models import Venue, VenueLayout

REQUIRED_FIELDS = (
    "title",
    "description",
    "venue_id",
    "starts_at",
    "ends_at",
    "visibility",
    "seating_mode",
    "responsible_name",
    "responsible_email",
    "responsible_phone",
)


def is_valid_timezone(name: str) -> bool:
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return False
    return True


async def get_application(
    session: AsyncSession, application_id: uuid.UUID, lock: bool = False
) -> EventApplication:
    query = select(EventApplication).where(EventApplication.id == application_id)
    if lock:
        query = query.with_for_update()
    application = (await session.exec(query)).first()
    if application is None:
        raise not_found("Application")
    return application


async def get_own_application(
    session: AsyncSession, user: User, application_id: uuid.UUID, lock: bool = False
) -> EventApplication:
    application = await get_application(session, application_id, lock)
    if application.applicant_user_id != user.id:
        raise not_found("Application")
    return application


async def get_readable_application(session: AsyncSession, user: User, application_id: uuid.UUID) -> EventApplication:
    application = await get_application(session, application_id)
    if application.applicant_user_id != user.id and not user.is_platform_admin:
        raise not_found("Application")
    return application


def ensure_status(application: EventApplication, *allowed: ApplicationStatus) -> None:
    if application.status not in allowed:
        raise AppError(
            409,
            "INVALID_APPLICATION_STATUS",
            f"Not allowed while the application is {application.status.value}",
        )


async def _set_categories(session: AsyncSession, application: EventApplication, category_ids: list[uuid.UUID]) -> None:
    category_ids = list(dict.fromkeys(category_ids))
    if category_ids:
        found = (
            await session.exec(
                select(Category.id).where(col(Category.id).in_(category_ids), col(Category.is_active).is_(True))
            )
        ).all()
        missing = set(category_ids) - set(found)
        if missing:
            raise AppError(422, "CATEGORY_NOT_FOUND", "Unknown category", {"category_ids": sorted(map(str, missing))})

    await session.exec(
        delete(EventApplicationCategory).where(col(EventApplicationCategory.application_id) == application.id)
    )
    session.add_all(
        [EventApplicationCategory(application_id=application.id, category_id=category_id) for category_id in category_ids]
    )


async def _apply_write(session: AsyncSession, application: EventApplication, data: ApplicationWrite) -> None:
    changes = data.model_dump(exclude_unset=True)

    category_ids = changes.pop("category_ids", None)
    if category_ids is not None:
        await _set_categories(session, application, category_ids)

    accept_terms = changes.pop("accept_organizer_terms", None)
    if accept_terms is True:
        application.organizer_terms_version = settings.organizer_terms_version
        application.organizer_terms_accepted_at = utcnow()
    elif accept_terms is False:
        application.organizer_terms_version = None
        application.organizer_terms_accepted_at = None

    if changes.get("venue_id") and await session.get(Venue, changes["venue_id"]) is None:
        raise AppError(422, "VENUE_NOT_FOUND", "Venue not found")
    if changes.get("venue_layout_id") and await session.get(VenueLayout, changes["venue_layout_id"]) is None:
        raise AppError(422, "VENUE_LAYOUT_NOT_FOUND", "Venue layout not found")
    if changes.get("timezone") and not is_valid_timezone(changes["timezone"]):
        raise AppError(422, "INVALID_TIMEZONE", "Timezone must be an IANA name like Asia/Almaty")
    if "intends_paid_sales" in changes and changes["intends_paid_sales"] is None:
        changes.pop("intends_paid_sales")

    for field, value in changes.items():
        setattr(application, field, value)
    session.add(application)


async def create_application(session: AsyncSession, user: User, data: ApplicationWrite) -> EventApplication:
    application = EventApplication(application_number=public_id("BF-EA-"), applicant_user_id=user.id)
    session.add(application)
    await session.flush()
    await _apply_write(session, application, data)
    await session.commit()
    return application


async def update_application(session: AsyncSession, user: User, application_id: uuid.UUID, data: ApplicationWrite):
    application = await get_own_application(session, user, application_id, lock=True)
    ensure_status(application, ApplicationStatus.DRAFT)
    await _apply_write(session, application, data)
    await session.commit()
    return application


async def add_image(session: AsyncSession, user: User, application_id: uuid.UUID, upload: UploadFile):
    application = await get_own_application(session, user, application_id, lock=True)
    ensure_status(application, ApplicationStatus.DRAFT)
    count = (
        await session.exec(
            select(func.count()).select_from(EventApplicationImage).where(
                EventApplicationImage.application_id == application.id
            )
        )
    ).one()
    if count >= settings.max_images_per_application:
        raise AppError(409, "TOO_MANY_IMAGES", f"At most {settings.max_images_per_application} images")

    storage_key = await save_image(upload, f"event-applications/{application.id}")
    session.add(EventApplicationImage(application_id=application.id, storage_key=storage_key, position=count))
    await session.commit()
    return application


async def delete_image(session: AsyncSession, user: User, application_id: uuid.UUID, image_id: uuid.UUID):
    application = await get_own_application(session, user, application_id, lock=True)
    ensure_status(application, ApplicationStatus.DRAFT)
    image = await session.get(EventApplicationImage, image_id)
    if image is None or image.application_id != application.id:
        raise not_found("Image")

    await session.delete(image)
    await session.exec(
        update(EventApplicationImage)
        .where(
            col(EventApplicationImage.application_id) == application.id,
            col(EventApplicationImage.position) > image.position,
        )
        .values(position=EventApplicationImage.position - 1)
    )
    await session.commit()
    return application


async def _category_ids(session: AsyncSession, application_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        (
            await session.exec(
                select(EventApplicationCategory.category_id)
                .join(Category, col(Category.id) == EventApplicationCategory.category_id)
                .where(
                    EventApplicationCategory.application_id == application_id,
                    col(Category.is_active).is_(True),
                )
            )
        ).all()
    )


async def _images(session: AsyncSession, application_id: uuid.UUID) -> list[EventApplicationImage]:
    return list(
        (
            await session.exec(
                select(EventApplicationImage)
                .where(EventApplicationImage.application_id == application_id)
                .order_by(col(EventApplicationImage.position))
            )
        ).all()
    )


async def submit_application(session: AsyncSession, user: User, application_id: uuid.UUID) -> EventApplication:
    application = await get_own_application(session, user, application_id, lock=True)
    ensure_status(application, ApplicationStatus.DRAFT)

    errors: list[str] = [field for field in REQUIRED_FIELDS if not getattr(application, field)]

    if not await _category_ids(session, application.id):
        errors.append("categories")
    if not await _images(session, application.id):
        errors.append("images")

    venue = await session.get(Venue, application.venue_id) if application.venue_id else None
    if application.venue_id and venue is None:
        errors.append("venue_id")

    if application.starts_at and application.ends_at:
        if as_utc(application.ends_at) <= as_utc(application.starts_at):
            errors.append("ends_at")
        if as_utc(application.starts_at) <= utcnow():
            errors.append("starts_at")

    if not application.timezone and venue is not None:
        application.timezone = venue.timezone
    if not application.timezone or not is_valid_timezone(application.timezone):
        errors.append("timezone")

    if application.seating_mode == SeatingMode.ASSIGNED_SEATING:
        layout = await session.get(VenueLayout, application.venue_layout_id) if application.venue_layout_id else None
        if layout is None or not layout.is_active or layout.venue_id != application.venue_id:
            errors.append("venue_layout_id")
    elif application.seating_mode == SeatingMode.GENERAL_ADMISSION:
        application.venue_layout_id = None

    if application.organizer_terms_version != settings.organizer_terms_version:
        errors.append("organizer_terms")

    if errors:
        raise AppError(
            422,
            "APPLICATION_INCOMPLETE",
            "Application is incomplete or has invalid fields",
            {"fields": list(dict.fromkeys(errors))},
        )

    application.venue_name_snapshot = venue.name
    application.venue_address_snapshot = venue.address
    application.venue_city_snapshot = venue.city
    application.status = ApplicationStatus.PENDING
    application.submitted_at = utcnow()
    session.add(application)
    await session.commit()
    return application


async def withdraw_application(session: AsyncSession, user: User, application_id: uuid.UUID) -> EventApplication:
    application = await get_own_application(session, user, application_id, lock=True)
    ensure_status(application, ApplicationStatus.PENDING)
    application.status = ApplicationStatus.WITHDRAWN
    session.add(application)
    await session.commit()
    return application


async def duplicate_application(session: AsyncSession, user: User, application_id: uuid.UUID) -> EventApplication:
    source = await get_own_application(session, user, application_id)
    copy = EventApplication(
        application_number=public_id("BF-EA-"),
        applicant_user_id=user.id,
        **source.model_dump(
            include={
                "title",
                "description",
                "venue_id",
                "starts_at",
                "ends_at",
                "timezone",
                "visibility",
                "seating_mode",
                "venue_layout_id",
                "responsible_name",
                "responsible_email",
                "responsible_phone",
                "intends_paid_sales",
            }
        ),
    )
    session.add(copy)
    await session.flush()
    session.add_all(
        [
            EventApplicationCategory(application_id=copy.id, category_id=category_id)
            for category_id in await _category_ids(session, source.id)
        ]
    )
    session.add_all(
        [
            EventApplicationImage(application_id=copy.id, storage_key=image.storage_key, position=image.position)
            for image in await _images(session, source.id)
        ]
    )
    await session.commit()
    return copy


async def list_own_applications(session: AsyncSession, user: User) -> list[EventApplication]:
    query = (
        select(EventApplication)
        .where(EventApplication.applicant_user_id == user.id)
        .order_by(col(EventApplication.created_at).desc())
    )
    return list((await session.exec(query)).all())


async def list_applications_for_review(
    session: AsyncSession, status: ApplicationStatus | None
) -> list[EventApplication]:
    query = select(EventApplication).where(EventApplication.status != ApplicationStatus.DRAFT)
    if status is not None:
        query = query.where(EventApplication.status == status)
    query = query.order_by(col(EventApplication.submitted_at))
    return list((await session.exec(query)).all())


async def approve_application(
    session: AsyncSession,
    admin: User,
    application_id: uuid.UUID,
    review_comment: str | None,
    background: BackgroundTasks,
) -> EventApplication:
    application = await get_application(session, application_id, lock=True)
    ensure_status(application, ApplicationStatus.PENDING)
    if application.applicant_user_id == admin.id:
        raise AppError(403, "SELF_APPROVAL_FORBIDDEN", "You cannot approve your own application")

    now = utcnow()
    application.status = ApplicationStatus.APPROVED
    application.reviewed_by_user_id = admin.id
    application.reviewed_at = now
    application.review_comment = review_comment
    session.add(application)

    event = Event(
        public_id=public_id("BF-E-"),
        slug=f"{slugify(application.title, max_length=80) or 'event'}-{secrets.token_hex(3)}",
        source_application_id=application.id,
        title=application.title,
        description=application.description,
        venue_id=application.venue_id,
        venue_layout_id=application.venue_layout_id,
        starts_at=application.starts_at,
        ends_at=application.ends_at,
        timezone=application.timezone,
        visibility=application.visibility,
        seating_mode=application.seating_mode,
        responsible_name=application.responsible_name,
        responsible_email=application.responsible_email,
        responsible_phone=application.responsible_phone,
    )
    session.add(event)
    await session.flush()

    session.add_all(
        [EventCategory(event_id=event.id, category_id=category_id) for category_id in await _category_ids(session, application.id)]
    )
    session.add_all(
        [
            EventImage(event_id=event.id, storage_key=image.storage_key, position=image.position)
            for image in await _images(session, application.id)
        ]
    )
    session.add(EventUserRole(event_id=event.id, user_id=application.applicant_user_id, event_role=EventRole.ORGANIZER))
    await session.commit()

    applicant = await session.get(User, application.applicant_user_id)
    background.add_task(
        send_email,
        applicant.email,
        f"BiletFlow: application {application.application_number} approved",
        f"Your application \"{application.title}\" has been approved.\n"
        "You are now the organizer of this event. Configure tickets and publish it when ready:\n"
        f"{settings.frontend_url}/organizer/events/{event.id}\n",
    )
    return application


async def reject_application(
    session: AsyncSession,
    admin: User,
    application_id: uuid.UUID,
    review_comment: str,
    background: BackgroundTasks,
) -> EventApplication:
    application = await get_application(session, application_id, lock=True)
    ensure_status(application, ApplicationStatus.PENDING)
    if not review_comment.strip():
        raise AppError(422, "REVIEW_COMMENT_REQUIRED", "A rejection must include a comment")

    application.status = ApplicationStatus.REJECTED
    application.reviewed_by_user_id = admin.id
    application.reviewed_at = utcnow()
    application.review_comment = review_comment.strip()
    session.add(application)
    await session.commit()

    applicant = await session.get(User, application.applicant_user_id)
    background.add_task(
        send_email,
        applicant.email,
        f"BiletFlow: application {application.application_number} rejected",
        f"Your application \"{application.title}\" was rejected.\n\nReviewer comment:\n{application.review_comment}\n\n"
        f"You can create a new application based on it: {settings.frontend_url}/applications/{application.id}\n",
    )
    return application


async def build_application_read(session: AsyncSession, application: EventApplication) -> ApplicationRead:
    categories = (
        await session.exec(
            select(Category)
            .join(EventApplicationCategory, col(EventApplicationCategory.category_id) == Category.id)
            .where(EventApplicationCategory.application_id == application.id)
            .order_by(col(Category.name))
        )
    ).all()
    images = await _images(session, application.id)
    event_id = (
        await session.exec(select(Event.id).where(Event.source_application_id == application.id))
    ).first()
    return ApplicationRead.model_validate(
        {
            **application.model_dump(),
            "categories": [CategoryRead.model_validate(c, from_attributes=True) for c in categories],
            "images": [ImageRead(id=i.id, url=file_url(i.storage_key), position=i.position) for i in images],
            "event_id": event_id,
        }
    )


async def build_application_reads(session: AsyncSession, applications: list[EventApplication]) -> list[ApplicationRead]:
    return [await build_application_read(session, application) for application in applications]
