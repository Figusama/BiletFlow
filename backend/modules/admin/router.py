import uuid

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from db.session import get_session
from modules.auth.dependencies import require_platform_admin
from modules.event_applications import service as applications
from modules.event_applications.models import ApplicationStatus
from modules.event_applications.schemas import ApplicationRead, ApproveRequest, RejectRequest
from modules.users.models import User

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_platform_admin)])


@router.get("/event-applications", response_model=list[ApplicationRead])
async def list_applications(
    status: ApplicationStatus | None = ApplicationStatus.PENDING, session: AsyncSession = Depends(get_session)
):
    return await applications.build_application_reads(
        session, await applications.list_applications_for_review(session, status)
    )


@router.post("/event-applications/{application_id}/approve", response_model=ApplicationRead)
async def approve_application(
    application_id: uuid.UUID,
    background: BackgroundTasks,
    data: ApproveRequest | None = None,
    admin: User = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
):
    application = await applications.approve_application(
        session, admin, application_id, data.review_comment if data else None, background
    )
    return await applications.build_application_read(session, application)


@router.post("/event-applications/{application_id}/reject", response_model=ApplicationRead)
async def reject_application(
    application_id: uuid.UUID,
    data: RejectRequest,
    background: BackgroundTasks,
    admin: User = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
):
    application = await applications.reject_application(session, admin, application_id, data.review_comment, background)
    return await applications.build_application_read(session, application)
