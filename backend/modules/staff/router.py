import uuid

from fastapi import APIRouter, Depends

from core.errors import not_implemented
from modules.auth.dependencies import get_current_user
from modules.users.models import User

router = APIRouter(tags=["event admins"])


@router.get("/events/{event_id}/admins")
async def list_event_admins(event_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.post("/events/{event_id}/admins/invitations", status_code=201)
async def invite_event_admin(event_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.delete("/events/{event_id}/admins/{user_id}", status_code=204)
async def revoke_event_admin(event_id: uuid.UUID, user_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.get("/invitations/mine")
async def my_invitations(user: User = Depends(get_current_user)):
    raise not_implemented()


@router.post("/invitations/{invitation_id}/accept")
async def accept_invitation(invitation_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.post("/invitations/{invitation_id}/decline")
async def decline_invitation(invitation_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()
