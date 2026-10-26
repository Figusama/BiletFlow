import uuid

from fastapi import APIRouter, Depends, UploadFile
from sqlmodel.ext.asyncio.session import AsyncSession

from db.session import get_session
from modules.auth.dependencies import get_current_user
from modules.event_applications import service
from modules.event_applications.schemas import ApplicationRead, ApplicationWrite
from modules.users.models import User

router = APIRouter(prefix="/event-applications", tags=["event applications"])


@router.post("", response_model=ApplicationRead, status_code=201)
async def create_application(
    data: ApplicationWrite, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    application = await service.create_application(session, user, data)
    return await service.build_application_read(session, application)


@router.get("/mine", response_model=list[ApplicationRead])
async def my_applications(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    return await service.build_application_reads(session, await service.list_own_applications(session, user))


@router.get("/{application_id}", response_model=ApplicationRead)
async def get_application(
    application_id: uuid.UUID, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    application = await service.get_readable_application(session, user, application_id)
    return await service.build_application_read(session, application)


@router.patch("/{application_id}", response_model=ApplicationRead)
async def update_application(
    application_id: uuid.UUID,
    data: ApplicationWrite,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    application = await service.update_application(session, user, application_id, data)
    return await service.build_application_read(session, application)


@router.post("/{application_id}/images", response_model=ApplicationRead, status_code=201)
async def upload_image(
    application_id: uuid.UUID,
    file: UploadFile,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    application = await service.add_image(session, user, application_id, file)
    return await service.build_application_read(session, application)


@router.delete("/{application_id}/images/{image_id}", response_model=ApplicationRead)
async def delete_image(
    application_id: uuid.UUID,
    image_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    application = await service.delete_image(session, user, application_id, image_id)
    return await service.build_application_read(session, application)


@router.post("/{application_id}/submit", response_model=ApplicationRead)
async def submit_application(
    application_id: uuid.UUID, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    application = await service.submit_application(session, user, application_id)
    return await service.build_application_read(session, application)


@router.post("/{application_id}/withdraw", response_model=ApplicationRead)
async def withdraw_application(
    application_id: uuid.UUID, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    application = await service.withdraw_application(session, user, application_id)
    return await service.build_application_read(session, application)


@router.post("/{application_id}/duplicate", response_model=ApplicationRead, status_code=201)
async def duplicate_application(
    application_id: uuid.UUID, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    application = await service.duplicate_application(session, user, application_id)
    return await service.build_application_read(session, application)
