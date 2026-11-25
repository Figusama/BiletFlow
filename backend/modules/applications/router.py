import uuid
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Response, UploadFile, status
from pydantic import AwareDatetime
from sqlalchemy import delete, or_
from sqlmodel import Session, select

from backend.core.clock import db_now
from backend.core.config import MAX_APPLICATION_IMAGES
from backend.core.media import save_image
from backend.core.paging import like_pattern, page
from backend.modules.admin.refs import person_like
from backend.modules.admin.router import created_between, require_admin
from backend.modules.applications import service
from backend.modules.applications.schemas import (AgreementAcceptance, ApplicationInput, ApplicationPublic, ApprovalRequest, CurrentAgreement,
                                                  RejectionRequest)
from backend.modules.audit import service as audit
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.access import require_organizer
from backend.modules.events.models import (event_application_agreements, event_application_categories, event_application_images, event_applications,
                                           event_categories, event_images)
from backend.modules.events.schemas import EventStatus
from backend.modules.notifications import service as notify
from backend.modules.users.user_model import users
from database.database import get_session

router = APIRouter(prefix="/event-applications", tags=["event applications"])
admin_router = APIRouter(prefix="/admin/event-applications", tags=["admin"])


@router.get("/agreements/current", response_model=list[CurrentAgreement])
def current_agreements():
    return [CurrentAgreement(document_type=k, document_version=v) for k, v in service.current_versions().items()]


@router.get("/mine", response_model=list[ApplicationPublic])
def my_applications(session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    rows = session.exec(select(event_applications).where(event_applications.applicant_user_id == current_user.id).order_by(event_applications.created_at.desc())).all()
    return [service.to_public(session, a) for a in rows]


@router.post("", response_model=ApplicationPublic, status_code=status.HTTP_201_CREATED)
def create_application(data: ApplicationInput, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    application = service.new_application(session, current_user)
    service.apply_changes(session, application, data.model_dump(exclude_unset=True))
    session.add(application)
    session.commit()
    session.refresh(application)
    return service.to_public(session, application)


@router.get("/{application_id}", response_model=ApplicationPublic)
def read_application(application_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    return service.to_public(session, service.get_readable_application(session, application_id, current_user))


@router.patch("/{application_id}", response_model=ApplicationPublic)
def update_application(application_id: uuid.UUID, data: ApplicationInput, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    application = service.get_own_application(session, application_id, current_user, for_update=True)
    service.ensure_draft(application)
    service.apply_changes(session, application, data.model_dump(exclude_unset=True))
    session.add(application)
    session.commit()
    session.refresh(application)
    return service.to_public(session, application)


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_draft(application_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    application = service.get_own_application(session, application_id, current_user, for_update=True)
    service.ensure_draft(application)
    session.exec(delete(event_application_categories).where(event_application_categories.application_id == application.id))
    session.exec(delete(event_application_images).where(event_application_images.application_id == application.id))
    session.exec(delete(event_application_agreements).where(event_application_agreements.application_id == application.id))
    session.delete(application)
    session.commit()


@router.post("/{application_id}/images", response_model=ApplicationPublic, status_code=status.HTTP_201_CREATED)
def upload_image(application_id: uuid.UUID, file: UploadFile = File(...), session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    application = service.get_own_application(session, application_id, current_user, for_update=True)
    service.ensure_draft(application)
    if len(service.application_images(session, application.id)) >= MAX_APPLICATION_IMAGES:
        raise HTTPException(status.HTTP_409_CONFLICT, f"At most {MAX_APPLICATION_IMAGES} images are allowed")
    storage_key = save_image(file, f"applications/{application.id}")
    session.add(event_application_images(application_id=application.id, storage_key=storage_key, position=service.next_image_position(session, application.id)))
    session.commit()
    session.refresh(application)
    return service.to_public(session, application)


@router.delete("/{application_id}/images/{image_id}", response_model=ApplicationPublic)
def delete_image(application_id: uuid.UUID, image_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    application = service.get_own_application(session, application_id, current_user, for_update=True)
    service.ensure_draft(application)
    image = session.get(event_application_images, image_id)
    if image is None or image.application_id != application.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")
    session.delete(image)
    session.commit()
    session.refresh(application)
    return service.to_public(session, application)


@router.put("/{application_id}/images/order", response_model=ApplicationPublic)
def reorder_images(application_id: uuid.UUID, image_ids: list[uuid.UUID], session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    application = service.get_own_application(session, application_id, current_user, for_update=True)
    service.ensure_draft(application)
    images = {i.id: i for i in service.application_images(session, application.id)}
    if set(image_ids) != set(images) or len(image_ids) != len(images):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Order must list every image exactly once")
    offset = len(images) + 1000
    for index, image_id in enumerate(image_ids):
        images[image_id].position = offset + index
        session.add(images[image_id])
    session.flush()
    for index, image_id in enumerate(image_ids):
        images[image_id].position = index
        session.add(images[image_id])
    session.commit()
    session.refresh(application)
    return service.to_public(session, application)


@router.put("/{application_id}/agreements", response_model=ApplicationPublic)
def accept_agreements(application_id: uuid.UUID, data: AgreementAcceptance, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    application = service.get_own_application(session, application_id, current_user, for_update=True)
    service.ensure_draft(application)
    versions = service.current_versions()
    now = db_now(session)
    for document_type in dict.fromkeys(d.value for d in data.documents):
        existing = session.exec(select(event_application_agreements).where(event_application_agreements.application_id == application.id,
                                                                            event_application_agreements.document_type == document_type)).first()
        if existing is None:
            existing = event_application_agreements(application_id=application.id, user_id=current_user.id, document_type=document_type, document_version=versions[document_type])
        existing.document_version = versions[document_type]
        existing.accepted_at = now
        session.add(existing)
    session.commit()
    session.refresh(application)
    return service.to_public(session, application)


@router.post("/{application_id}/submit", response_model=ApplicationPublic)
def submit_application(application_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    application = service.get_own_application(session, application_id, current_user, for_update=True)
    service.ensure_draft(application)
    now = db_now(session)
    if application.venue_id:
        service.apply_venue(session, application, application.venue_id)
    problems = service.missing_for_submit(session, application, now)
    if problems:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "incomplete_application", "problems": problems})
    application.status = EventStatus.PENDING
    application.submitted_at = now
    session.add(application)
    audit.record(session, action="EVENT_APPLICATION_SUBMITTED", entity_type="EVENT_APPLICATION", entity_id=application.id, actor_user_id=current_user.id,
                 details={"application_number": application.application_number})
    session.commit()
    session.refresh(application)
    return service.to_public(session, application)


@router.post("/{application_id}/withdraw", response_model=ApplicationPublic)
def withdraw_application(application_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    application = service.get_own_application(session, application_id, current_user, for_update=True)
    if application.status != EventStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only applications under review can be withdrawn")
    application.status = EventStatus.WITHDRAWN
    session.add(application)
    audit.record(session, action="EVENT_APPLICATION_WITHDRAWN", entity_type="EVENT_APPLICATION", entity_id=application.id, actor_user_id=current_user.id,
                 details={"application_number": application.application_number})
    session.commit()
    session.refresh(application)
    return service.to_public(session, application)


@router.post("/{application_id}/copy", response_model=ApplicationPublic, status_code=status.HTTP_201_CREATED)
def copy_application(application_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    source = service.get_own_application(session, application_id, current_user)
    draft = service.prefilled_draft(
        session, current_user, title=source.title, description=source.description, venue_id=source.venue_id, venue_layout_id=source.venue_layout_id,
        timezone=source.timezone, visibility=source.visibility, seating_mode=source.seating_mode, responsible_name=source.responsible_name,
        responsible_email=source.responsible_email, responsible_phone=source.responsible_phone, intends_paid_sales=source.intends_paid_sales,
        category_ids=[c.id for c in service.application_categories(session, source.id)], images=service.application_images(session, source.id),
    )
    session.commit()
    session.refresh(draft)
    return service.to_public(session, draft)


duplicate_router = APIRouter(prefix="/events", tags=["events"])


@duplicate_router.post("/{event_id}/duplicate", response_model=ApplicationPublic, status_code=status.HTTP_201_CREATED)
def duplicate_event(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event = require_organizer(session, event_id, current_user)
    category_ids = list(session.exec(select(event_categories.category_id).where(event_categories.event_id == event.id)).all())
    images = list(session.exec(select(event_images).where(event_images.event_id == event.id).order_by(event_images.position)).all())
    draft = service.prefilled_draft(
        session, current_user, title=event.title, description=event.description, venue_id=event.venue_id, venue_layout_id=event.venue_layout_id,
        timezone=event.timezone, visibility=event.visibility, seating_mode=event.seating_mode, responsible_name=event.responsible_name,
        responsible_email=event.responsible_email, responsible_phone=event.responsible_phone, intends_paid_sales=False,
        category_ids=category_ids, images=images,
    )
    audit.record(session, action="EVENT_DUPLICATED", entity_type="EVENT", entity_id=event.id, event_id=event.id, actor_user_id=current_user.id,
                 details={"application_number": draft.application_number})
    session.commit()
    session.refresh(draft)
    return service.to_public(session, draft)


@admin_router.get("", response_model=list[ApplicationPublic])
def admin_list(response: Response, application_status: EventStatus | Literal["ALL"] = Query(default=EventStatus.PENDING, alias="status"), q: str | None = None,
               date_from: AwareDatetime | None = Query(default=None, alias="from"), date_to: AwareDatetime | None = Query(default=None, alias="to"), limit: int = Query(default=50, ge=1, le=200),
               offset: int = Query(default=0, ge=0), session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    query = select(event_applications).where(*created_between(event_applications.submitted_at, date_from, date_to))
    query = query.where(event_applications.status != EventStatus.DRAFT if application_status == "ALL" else event_applications.status == application_status)
    if q and q.strip():
        pattern = like_pattern(q)
        query = query.where(or_(event_applications.application_number.ilike(pattern), event_applications.title.ilike(pattern), event_applications.responsible_name.ilike(pattern),
                                event_applications.responsible_email.ilike(pattern), person_like(event_applications.applicant_user_id, pattern)))
    rows = page(session, response, query.order_by(event_applications.submitted_at.asc().nulls_last(), event_applications.created_at, event_applications.id), limit, offset)
    return [service.to_public(session, a) for a in rows]


@admin_router.post("/{application_id}/approve", response_model=ApplicationPublic)
def admin_approve(application_id: uuid.UUID, data: ApprovalRequest, background: BackgroundTasks, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    if not data.confirm_responsible_organizer:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Confirm that the responsible organizer was verified")
    application = service.get_application(session, application_id, for_update=True)
    if application.status != EventStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only applications under review can be approved")
    if application.applicant_user_id == admin.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot review your own application")
    service.approve(session, application, admin, data.review_comment)
    session.commit()
    background.add_task(notify.deliver_due)
    session.refresh(application)
    return service.to_public(session, application)


@admin_router.post("/{application_id}/reject", response_model=ApplicationPublic)
def admin_reject(application_id: uuid.UUID, data: RejectionRequest, background: BackgroundTasks, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    application = service.get_application(session, application_id, for_update=True)
    if application.status != EventStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only applications under review can be rejected")
    if application.applicant_user_id == admin.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot review your own application")
    now = db_now(session)
    application.status = EventStatus.REJECTED
    application.reviewed_by_user_id = admin.id
    application.reviewed_at = now
    application.review_comment = data.review_comment.strip()
    session.add(application)
    audit.record(session, action="EVENT_APPLICATION_REJECTED", entity_type="EVENT_APPLICATION", entity_id=application.id, actor_user_id=admin.id,
                 details={"application_number": application.application_number, "comment": application.review_comment})
    service.notify_decision(session, application, False)
    session.commit()
    background.add_task(notify.deliver_due)
    session.refresh(application)
    return service.to_public(session, application)
