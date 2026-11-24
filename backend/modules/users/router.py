from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import jwt
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, Field, select, delete
from database.database import get_session
from backend.modules.audit import service as audit
from backend.modules.auth.dependencies import oauth_2_scheme, get_current_user, authenticate_user, create_access_token, get_password_hash, verify_password
from backend.modules.auth.config import SECRET_KEY, ALGORITHM
from backend.modules.users.schemas import Role
from backend.modules.users.user_model import users, profiles, refresh_sessions, password_reset_tokens
from backend.modules.users.schemas import UserCreate, UserPublic, Token, ProfileUpdate, PasswordChange
import uuid

router = APIRouter(prefix="/users", tags=["users"])

def get_profile(session: Session, user_id : uuid.UUID) -> profiles | None:
    return session.exec(select(profiles).where(profiles.user_id == user_id)).first()

def to_public(user: users, profile : profiles | None) -> UserPublic:
    return UserPublic(id=user.id, public_id=user.public_id, email=user.email, personal_role=user.personal_role, full_name=profile.full_name if profile else "")

def require_admin(current_user : users =  Depends(get_current_user)) -> users:
    if current_user.personal_role != Role.PLATFORM_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return current_user

@router.get("/me", response_model=UserPublic)
def read_me(session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    return to_public(current_user, get_profile(session, current_user.id))

@router.patch("/me", response_model=UserPublic)
def update_me(data: ProfileUpdate, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    profile = get_profile(session, current_user.id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(profile, key, value)
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return to_public(current_user, profile)

@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(data: PasswordChange, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    current_user.password_hash = get_password_hash(data.new_password)
    session.add(current_user)
    session.commit()

@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    session.exec(delete(refresh_sessions).where(refresh_sessions.user_id == current_user.id))
    session.exec(delete(password_reset_tokens).where(password_reset_tokens.user_id == current_user.id))
    
    profile = get_profile(session, current_user.id)
    if profile:
        session.delete(profile)
    session.flush()
    session.delete(current_user)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Account with reservations, orders or tickets cannot be deleted")

@router.get("/", response_model=list[UserPublic])
def list_users(session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    result = []
    for user in session.exec(select(users)).all():
        result.append(to_public(user, get_profile(session, user.id)))
    return result

@router.get("/{user_id}", response_model=UserPublic)
def read_user(user_id: uuid.UUID, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    user = session.get(users, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return to_public(user, get_profile(session, user.id))

@router.post("/{user_id}/suspend", status_code=status.HTTP_204_NO_CONTENT)
def suspend_user(user_id: uuid.UUID, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    user = session.get(users, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == admin.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot suspend yourself")
    if not user.is_suspended:
        user.is_suspended = True
        session.add(user)
        audit.record(session, action="USER_SUSPENDED", entity_type="USER", entity_id=user.id, actor_user_id=admin.id)
    session.commit()

@router.post("/{user_id}/unsuspend", status_code=status.HTTP_204_NO_CONTENT)
def unsuspend_user(user_id: uuid.UUID, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    user = session.get(users, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.is_suspended:
        user.is_suspended = False
        session.add(user)
        audit.record(session, action="USER_SUSPENSION_LIFTED", entity_type="USER", entity_id=user.id, actor_user_id=admin.id)
    session.commit()