import uuid

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from core.errors import AppError, not_implemented
from db.session import get_session
from modules.auth.dependencies import require_platform_admin
from modules.auth.service import revoke_all_sessions
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


@router.get("/event-change-requests")
async def list_change_requests(status: str | None = "PENDING"):
    raise not_implemented()


@router.post("/event-change-requests/{request_id}/approve")
async def approve_change_request(request_id: uuid.UUID, admin: User = Depends(require_platform_admin)):
    raise not_implemented()


@router.post("/event-change-requests/{request_id}/reject")
async def reject_change_request(request_id: uuid.UUID, admin: User = Depends(require_platform_admin)):
    raise not_implemented()


@router.get("/users")
async def search_users(q: str | None = None):
    raise not_implemented()


@router.post("/users/{user_id}/suspend", status_code=204)
async def suspend_user(
    user_id: uuid.UUID, admin: User = Depends(require_platform_admin), session: AsyncSession = Depends(get_session)
):
    if user_id == admin.id:
        raise AppError(409, "CANNOT_SUSPEND_SELF", "You cannot suspend your own account")
    user = await session.get(User, user_id)
    if user is None:
        raise AppError(404, "NOT_FOUND", "User not found")
    user.is_suspended = True
    session.add(user)
    await revoke_all_sessions(session, user.id)
    await session.commit()


@router.post("/users/{user_id}/unsuspend", status_code=204)
async def unsuspend_user(user_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    user = await session.get(User, user_id)
    if user is None:
        raise AppError(404, "NOT_FOUND", "User not found")
    user.is_suspended = False
    session.add(user)
    await session.commit()


@router.post("/events/{event_id}/suspend-paid-sales")
async def suspend_paid_sales(event_id: uuid.UUID):
    raise not_implemented()
