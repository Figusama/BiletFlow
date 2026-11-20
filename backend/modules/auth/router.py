from datetime import datetime, timedelta, timezone
import secrets

from fastapi import status, Depends, HTTPException, APIRouter, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from backend.modules.auth.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, EMAIL_VERIFICATION_EXPIRE_HOURS, APP_URL
from sqlmodel import Session, select

from database.database import get_session
from backend.modules.users.schemas import UserCreate, UserPublic, Token, Message
from backend.modules.users.user_model import users, profiles, pending_registrations
from backend.modules.auth.dependencies import get_current_active_user, get_password_hash, verify_password, get_session, authenticate_user, create_access_token, get_user, get_pending_registration, hash_token
from backend.modules.auth.email import send_email


router = APIRouter(prefix="/auth", tags=["auth"])




@router.post("/register", response_model=Message, status_code=status.HTTP_202_ACCEPTED)
async def register(user_in: UserCreate, background_tasks: BackgroundTasks, session : Session = Depends(get_session)):
    if get_user(session, user_in.email) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    token = secrets.token_urlsafe(32)
    pending = get_pending_registration(session, user_in.email) or pending_registrations(email=user_in.email)
    pending.password_hash = get_password_hash(user_in.password)
    pending.full_name = user_in.full_name
    pending.phone = user_in.phone
    pending.verification_hash = hash_token(token)
    pending.expires_at = datetime.now(timezone.utc) + timedelta(hours=EMAIL_VERIFICATION_EXPIRE_HOURS)

    session.add(pending)
    session.commit()

    link = f"{APP_URL}/auth/verify-email?token={token}"
    background_tasks.add_task(
        send_email,
        user_in.email,
        "BiletFlow: confirm your email",
        f"Hi {user_in.full_name}!\n\nConfirm your email to finish registration:\n{link}\n\nThe link is valid for {EMAIL_VERIFICATION_EXPIRE_HOURS} hours.",
    )
    return Message(detail="Check your email to confirm registration")


@router.get("/verify-email", response_model=Token)
async def verify_email(token: str, session : Session = Depends(get_session)):
    pending = session.exec(select(pending_registrations).where(pending_registrations.verification_hash == hash_token(token))).first()
    if pending is None or pending.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired verification link")

    if get_user(session, pending.email) is not None:
        session.delete(pending)
        session.commit()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already verified, please log in")

    user = users(email=pending.email, password_hash=pending.password_hash)
    session.add(user)
    session.flush()
    session.add(profiles(user_id=user.id, full_name=pending.full_name, phone=pending.phone))
    session.delete(pending)
    session.commit()

    return {"access_token": create_access_token(user.email),
            "token_type": "bearer"}


@router.post("/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), session : Session = Depends(get_session)):
    user = authenticate_user(session, form_data.username, form_data.password)
    if not user:
        pending = get_pending_registration(session, form_data.username)
        if pending and verify_password(form_data.password, pending.password_hash):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email is not verified")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password", headers={"WWW-Authenticate": "Bearer"})
    if user.is_suspended:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is suspended")

    access_token = create_access_token(user.email)
    return {"access_token": access_token,
            "token_type": "bearer"}


@router.get("/users/me/", response_model=UserPublic)
async def read_users_me(current_user : users = Depends(get_current_active_user), session : Session = Depends(get_session)):
    profile = session.get(profiles, current_user.id)
    return UserPublic(
        id=current_user.id,
        public_id=current_user.public_id,
        email=current_user.email,
        personal_role=current_user.personal_role,
        full_name=profile.full_name if profile else "",
    )
