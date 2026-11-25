import secrets
import uuid
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from backend.core import crypto
from backend.core.clock import as_aware, db_now
from backend.core.config import FRONTEND_URL, PRIVATE_INVITATION_TTL_HOURS, STAFF_INVITATION_TTL_DAYS
from backend.modules.audit import service as audit
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.access import get_event_or_404, require_organizer
from backend.modules.events.models import event_staff_invitations, events, private_event_invitations
from backend.modules.events.schemas import EventLifecycleStatus, Visibility
from backend.modules.invitations.schemas import (PrivateInvitationCreate, PrivateInvitationPublic, PrivateInvitationTarget, StaffInvitationCreate,
                                                 StaffInvitationPublic, StaffMember, StaffOverview, StaffRole)
from backend.modules.notifications import service as notify
from backend.modules.orders.models import orders
from backend.modules.tickets.models import tickets
from backend.modules.tickets.schemas import TicketStatus
from backend.modules.users.user_model import EventRole, event_user_roles, profiles, users
from database.database import get_session

router = APIRouter(tags=["invitations"])

CLOSED_EVENT = (EventLifecycleStatus.CANCELLED, EventLifecycleStatus.COMPLETED)


def ensure_open(event: events) -> None:
    if event.status in CLOSED_EVENT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Event is already finished or cancelled")


def staff_status(invitation: event_staff_invitations, now) -> str:
    if invitation.status == "PENDING" and as_aware(invitation.expires_at) <= now:
        return "EXPIRED"
    return invitation.status


def staff_to_public(session: Session, invitation: event_staff_invitations, now) -> StaffInvitationPublic:
    event = session.get(events, invitation.event_id)
    invitee = session.get(users, invitation.invited_user_id)
    profile = session.get(profiles, invitee.id)
    return StaffInvitationPublic(
        id=invitation.id, event_id=event.id, event_title=event.title, invited_user_public_id=invitee.public_id,
        invited_user_name=profile.full_name if profile else None, invited_role=invitation.invited_role, status=staff_status(invitation, now),
        expires_at=invitation.expires_at, created_at=invitation.created_at, accepted_at=invitation.accepted_at,
        declined_at=invitation.declined_at, revoked_at=invitation.revoked_at,
    )


def has_role(session: Session, event_id: uuid.UUID, user_id: uuid.UUID, role: str) -> bool:
    return session.exec(select(event_user_roles).where(event_user_roles.event_id == event_id, event_user_roles.user_id == user_id,
                                                       event_user_roles.event_role == role)).first() is not None


def organizer_id(session: Session, event_id: uuid.UUID) -> uuid.UUID | None:
    return session.exec(select(event_user_roles.user_id).where(event_user_roles.event_id == event_id, event_user_roles.event_role == EventRole.ORGANIZER)).first()


@router.post("/events/{event_id}/staff-invitations", response_model=StaffInvitationPublic, status_code=status.HTTP_201_CREATED)
def invite_staff(event_id: uuid.UUID, data: StaffInvitationCreate, background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    ensure_open(event)
    invitee = session.exec(select(users).where(users.public_id == data.user_public_id)).first()
    if invitee is None or invitee.is_suspended:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if invitee.id == current_user.id or invitee.id == organizer_id(session, event.id):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The organizer cannot be invited as staff")
    if has_role(session, event.id, invitee.id, data.role.value):
        raise HTTPException(status.HTTP_409_CONFLICT, "User already holds this role")
    now = db_now(session)
    pending = session.exec(select(event_staff_invitations).where(
        event_staff_invitations.event_id == event.id, event_staff_invitations.invited_user_id == invitee.id,
        event_staff_invitations.invited_role == data.role.value, event_staff_invitations.status == "PENDING",
    ).with_for_update()).first()
    if pending is not None:
        if as_aware(pending.expires_at) > now:
            raise HTTPException(status.HTTP_409_CONFLICT, "An invitation is already pending")
        pending.status = "REVOKED"
        pending.revoked_at = now
        session.add(pending)
        session.flush()
    invitation = event_staff_invitations(event_id=event.id, invited_user_id=invitee.id, invited_by_user_id=current_user.id, invited_role=data.role.value,
                                         status="PENDING", expires_at=now + timedelta(days=STAFF_INVITATION_TTL_DAYS))
    session.add(invitation)
    session.flush()
    role_name = "event administrator" if data.role == StaffRole.EVENT_ADMIN else "event support agent"
    notify.publish(session, notify.Notice(
        key=f"STAFF_INVITED:{invitation.id}", event_type="EVENT_STAFF_INVITED", aggregate_type="EVENT_STAFF_INVITATION", aggregate_id=invitation.id,
        title="Event staff invitation", body=f"You were invited to \"{event.title}\" as {role_name}.", action_url=f"{FRONTEND_URL}/staff-invitations",
        inbox_user_ids=[invitee.id], emails=[notify.Email(address=invitee.email, user_id=invitee.id)],
    ))
    audit.record(session, action="EVENT_STAFF_INVITED", entity_type="EVENT_STAFF_INVITATION", entity_id=invitation.id, event_id=event.id,
                 actor_user_id=current_user.id, details={"invited_user_public_id": invitee.public_id, "role": data.role.value})
    session.commit()
    background.add_task(notify.deliver_due)
    return staff_to_public(session, invitation, now)


@router.get("/events/{event_id}/staff", response_model=StaffOverview)
def event_staff(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    now = db_now(session)
    members: dict[uuid.UUID, StaffMember] = {}
    rows = session.exec(select(event_user_roles, users, profiles.full_name).join(users, users.id == event_user_roles.user_id)
                        .outerjoin(profiles, profiles.user_id == users.id).where(event_user_roles.event_id == event_id)).all()
    for role, user, name in rows:
        member = members.setdefault(user.id, StaffMember(user_id=user.id, public_id=user.public_id, full_name=name, roles=[]))
        member.roles.append(role.event_role.value if hasattr(role.event_role, "value") else role.event_role)
    invitations = session.exec(select(event_staff_invitations).where(event_staff_invitations.event_id == event_id).order_by(event_staff_invitations.created_at.desc())).all()
    return StaffOverview(members=list(members.values()), invitations=[staff_to_public(session, i, now) for i in invitations])


@router.post("/events/{event_id}/staff-invitations/{invitation_id}/revoke", response_model=StaffInvitationPublic)
def revoke_staff_invitation(event_id: uuid.UUID, invitation_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    get_event_or_404(session, event_id, for_update=True)
    invitation = session.exec(select(event_staff_invitations).where(event_staff_invitations.id == invitation_id, event_staff_invitations.event_id == event_id)
                              .with_for_update().execution_options(populate_existing=True)).first()
    if invitation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    if invitation.status != "PENDING":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only pending invitations can be revoked")
    now = db_now(session)
    invitation.status = "REVOKED"
    invitation.revoked_at = now
    session.add(invitation)
    audit.record(session, action="EVENT_STAFF_INVITATION_REVOKED", entity_type="EVENT_STAFF_INVITATION", entity_id=invitation.id, event_id=event_id,
                 actor_user_id=current_user.id, details={"role": invitation.invited_role})
    session.commit()
    return staff_to_public(session, invitation, now)


@router.delete("/events/{event_id}/staff/{user_id}/roles/{role}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_staff_role(event_id: uuid.UUID, user_id: uuid.UUID, role: StaffRole, background: BackgroundTasks, session: Session = Depends(get_session),
                      current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    if event.status == EventLifecycleStatus.COMPLETED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Event is completed")
    grant = session.exec(select(event_user_roles).where(event_user_roles.event_id == event_id, event_user_roles.user_id == user_id,
                                                        event_user_roles.event_role == role.value).with_for_update()).first()
    if grant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    session.delete(grant)
    if role == StaffRole.EVENT_SUPPORT:
        from backend.modules.support.service import release_assignments
        release_assignments(session, event_id, user_id, current_user.id)
    now = db_now(session)
    notify.publish(session, notify.Notice(
        key=f"STAFF_ROLE_REVOKED:{event_id}:{user_id}:{role.value}:{now.isoformat()}", event_type="EVENT_ROLE_REVOKED", aggregate_type="EVENT", aggregate_id=event_id,
        title="Event role removed", body=f"Your {role.value.replace('_', ' ').lower()} role for \"{event.title}\" was removed.", inbox_user_ids=[user_id],
    ))
    audit.record(session, action="EVENT_ROLE_REVOKED", entity_type="EVENT_USER_ROLE", entity_id=user_id, event_id=event_id, actor_user_id=current_user.id,
                 details={"role": role.value})
    session.commit()
    background.add_task(notify.deliver_due)


@router.get("/staff-invitations/mine", response_model=list[StaffInvitationPublic])
def my_staff_invitations(session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    now = db_now(session)
    rows = session.exec(select(event_staff_invitations).where(event_staff_invitations.invited_user_id == current_user.id)
                        .order_by(event_staff_invitations.created_at.desc())).all()
    return [staff_to_public(session, i, now) for i in rows]


def _lock_own_invitation(session: Session, invitation_id: uuid.UUID, user: users) -> tuple[events, event_staff_invitations]:
    snapshot = session.get(event_staff_invitations, invitation_id)
    if snapshot is None or snapshot.invited_user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    event = get_event_or_404(session, snapshot.event_id, for_update=True)
    invitation = session.exec(select(event_staff_invitations).where(event_staff_invitations.id == invitation_id)
                              .with_for_update().execution_options(populate_existing=True)).first()
    return event, invitation


@router.post("/staff-invitations/{invitation_id}/accept", response_model=StaffInvitationPublic)
def accept_staff_invitation(invitation_id: uuid.UUID, background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event, invitation = _lock_own_invitation(session, invitation_id, current_user)
    now = db_now(session)
    if invitation.status == "ACCEPTED":
        return staff_to_public(session, invitation, now)
    if staff_status(invitation, now) != "PENDING":
        raise HTTPException(status.HTTP_409_CONFLICT, "Invitation is no longer valid")
    ensure_open(event)
    if not has_role(session, event.id, current_user.id, invitation.invited_role):
        session.add(event_user_roles(event_id=event.id, user_id=current_user.id, event_role=invitation.invited_role))
    invitation.status = "ACCEPTED"
    invitation.accepted_at = now
    session.add(invitation)
    owner = organizer_id(session, event.id)
    if owner:
        notify.publish(session, notify.Notice(
            key=f"STAFF_ACCEPTED:{invitation.id}", event_type="EVENT_STAFF_ACCEPTED", aggregate_type="EVENT_STAFF_INVITATION", aggregate_id=invitation.id,
            title="Staff invitation accepted", body=f"{current_user.public_id} accepted the {invitation.invited_role} invitation for \"{event.title}\".", inbox_user_ids=[owner],
        ))
    audit.record(session, action="EVENT_ROLE_ASSIGNED", entity_type="EVENT_USER_ROLE", entity_id=current_user.id, event_id=event.id, actor_user_id=current_user.id,
                 details={"role": invitation.invited_role, "invitation_id": str(invitation.id)})
    session.commit()
    background.add_task(notify.deliver_due)
    return staff_to_public(session, invitation, now)


@router.post("/staff-invitations/{invitation_id}/decline", response_model=StaffInvitationPublic)
def decline_staff_invitation(invitation_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event, invitation = _lock_own_invitation(session, invitation_id, current_user)
    now = db_now(session)
    if staff_status(invitation, now) != "PENDING":
        raise HTTPException(status.HTTP_409_CONFLICT, "Invitation is no longer valid")
    invitation.status = "DECLINED"
    invitation.declined_at = now
    session.add(invitation)
    audit.record(session, action="EVENT_STAFF_INVITATION_DECLINED", entity_type="EVENT_STAFF_INVITATION", entity_id=invitation.id, event_id=event.id,
                 actor_user_id=current_user.id, details={"role": invitation.invited_role})
    session.commit()
    return staff_to_public(session, invitation, now)


def private_to_public_list(session: Session, event_id: uuid.UUID, rows: list[private_event_invitations], now) -> list[PrivateInvitationPublic]:
    email = func.lower(users.email)
    bought = dict(session.exec(select(email, func.count(tickets.id)).join(orders, orders.buyer_user_id == users.id).join(tickets, tickets.order_id == orders.id)
                               .where(orders.event_id == event_id, email.in_({i.invited_email.lower() for i in rows}),
                                      tickets.status.in_((TicketStatus.VALID, TicketStatus.CHECKED_IN))).group_by(email)).all())
    return [PrivateInvitationPublic(id=i.id, invited_email=i.invited_email, created_at=i.created_at, expires_at=i.expires_at,
                                    is_active=as_aware(i.expires_at) > now, tickets_count=bought.get(i.invited_email.lower(), 0)) for i in rows]


@router.post("/events/{event_id}/private-invitations", response_model=list[PrivateInvitationPublic], status_code=status.HTTP_201_CREATED)
def invite_private_guests(event_id: uuid.UUID, data: PrivateInvitationCreate, background: BackgroundTasks, session: Session = Depends(get_session),
                          current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    ensure_open(event)
    if event.visibility != Visibility.PRIVATE:
        raise HTTPException(status.HTTP_409_CONFLICT, "Invitations are only for private events")
    now = db_now(session)
    created = []
    for email in dict.fromkeys(e.lower() for e in data.emails):
        token = secrets.token_urlsafe(32)
        invitation = private_event_invitations(event_id=event.id, invited_email=email, invited_by_user_id=current_user.id,
                                               token_hash=crypto.token_hash(token), created_at=now, expires_at=now + timedelta(hours=PRIVATE_INVITATION_TTL_HOURS))
        session.add(invitation)
        session.flush()
        recipient = session.exec(select(users).where(func.lower(users.email) == email)).first()
        notify.publish(session, notify.Notice(
            key=f"PRIVATE_INVITATION:{invitation.id}", event_type="PRIVATE_EVENT_INVITATION", aggregate_type="PRIVATE_EVENT_INVITATION", aggregate_id=invitation.id,
            title="You are invited", body=f"You are invited to the private event \"{event.title}\".",
            inbox_user_ids=[recipient.id] if recipient else [],
            emails=[notify.Email(address=email, user_id=recipient.id if recipient else None, invitation_id=invitation.id, secret_link=f"{FRONTEND_URL}/invitations/{token}",
                                 body=f"You are invited to the private event \"{event.title}\".\nSign in or register with this email address and open the link within "
                                      f"{PRIVATE_INVITATION_TTL_HOURS} hours:\n{notify.SECRET_PLACEHOLDER}")],
        ))
        created.append(invitation)
    audit.record(session, action="PRIVATE_INVITATIONS_SENT", entity_type="EVENT", entity_id=event.id, event_id=event.id, actor_user_id=current_user.id,
                 details={"count": len(created)})
    session.commit()
    background.add_task(notify.deliver_due)
    return private_to_public_list(session, event.id, created, now)


@router.get("/events/{event_id}/private-invitations", response_model=list[PrivateInvitationPublic])
def list_private_invitations(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    now = db_now(session)
    rows = session.exec(select(private_event_invitations).where(private_event_invitations.event_id == event_id).order_by(private_event_invitations.created_at.desc())).all()
    return private_to_public_list(session, event_id, rows, now)


@router.get("/private-invitations/{token}", response_model=PrivateInvitationTarget)
def open_private_invitation(token: str, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    invitation = session.exec(select(private_event_invitations).where(private_event_invitations.token_hash == crypto.token_hash(token))).first()
    if invitation is None or invitation.invited_email.lower() != current_user.email.lower():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    if as_aware(invitation.expires_at) <= db_now(session):
        raise HTTPException(status.HTTP_410_GONE, "Invitation has expired")
    event = session.get(events, invitation.event_id)
    return PrivateInvitationTarget(event_id=event.id, slug=event.slug, expires_at=invitation.expires_at)
