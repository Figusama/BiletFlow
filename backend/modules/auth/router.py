from datetime import datetime, timedelta, timezone
import secrets

from fastapi import status, Depends, HTTPException, APIRouter, BackgroundTasks, Response, Cookie
from fastapi.security import OAuth2PasswordRequestForm
from backend.modules.auth.config import EMAIL_VERIFICATION_EXPIRE_HOURS, FRONTEND_URL, REFRESH_COOKIE, REFRESH_DAYS
from sqlmodel import Session, select

from database.database import get_session
from backend.modules.users.schemas import UserCreate, UserPublic, Token, Message
from backend.modules.users.user_model import users, profiles, pending_registrations, refresh_session, password_reset_tokens
from backend.modules.auth.dependencies import get_current_active_user, get_password_hash, verify_password, get_session, authenticate_user, create_access_token, get_user, get_pending_registration, hash_token, create_refresh_session, set_refresh_cookie, revoke_all_sessions
from backend.modules.auth.email import send_email
from backend.modules.auth.schema import ForgotPassword, ResetPassword

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

    link = f"{FRONTEND_URL}/auth/verify-email?token={token}"
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
async def login(response: Response, form_data: OAuth2PasswordRequestForm = Depends(), session : Session = Depends(get_session)):
    user = authenticate_user(session, form_data.username, form_data.password)
    if not user:
        pending = get_pending_registration(session, form_data.username)
        if pending and verify_password(form_data.password, pending.password_hash):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email is not verified")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password", headers={"WWW-Authenticate": "Bearer"})
    if user.is_suspended:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is suspended")

    access_token = create_access_token(user.email)

    raw = create_refresh_session(session, user.id)
    session.commit()
    set_refresh_cookie(response, raw)

    return {"access_token": access_token,
            "token_type": "bearer"}

@router.post("/refresh", response_model=Token)
async def refresh(response: Response, refresh_token: str | None = Cookie(default=None), session: Session = Depends(get_session)):
    if not refresh_token:
        raise HTTPException(401, "Missing refresh token")
    rs = session.exec(select(refresh_session).where(refresh_session.refresh_token_hash == hash_token(refresh_token))).first()
    now = datetime.now(timezone.utc)
    if rs is None or rs.expires_at <= now:
        raise HTTPException(401, "Invalid refresh token")
    if rs.revoked_at is not None:
        revoke_all_sessions(session, rs.user_id)
        session.commit()
        raise HTTPException(401, "Refresh token reuse detected")

    rs.revoked_at = now
    user = session.get(users, rs.user_id)
    new_raw = create_refresh_session(session, user.id)
    session.commit()
    set_refresh_cookie(response, new_raw)
    return {"access_token": create_access_token(user.email), "token_type": "bearer"}

@router.post("/logout", status_code=204)
async def logout(response: Response, refresh_token: str | None = Cookie(default=None), session: Session = Depends(get_session)):
    if refresh_token:
        rs = session.exec(select(refresh_session).where(refresh_session.refresh_token_hash == hash_token(refresh_token))).first()
        if rs and rs.revoked_at is None:
            rs.revoked_at = datetime.now(timezone.utc)
            session.commit()
    response.delete_cookie(REFRESH_COOKIE, path="/auth")

@router.post("/forgot-password", response_model=Message)
async def forgot_password(body: ForgotPassword, background_tasks: BackgroundTasks, session: Session = Depends(get_session)):
    user = get_user(session, body.email)
    if user:
        raw = secrets.token_urlsafe(32)
        session.add(password_reset_tokens(
            user_id=user.id, token_hash=hash_token(raw),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        ))
        session.commit()
        link = f"{FRONTEND_URL}/auth/reset-password?token={raw}"
        background_tasks.add_task(send_email, user.email, "BiletFlow: reset your password", f"Reset your password:\n{link}\n\nValid for 1 hour.")
    return Message(detail="If this email exists, a reset link has been sent")


@router.post("/reset-password", response_model=Message)
async def reset_password(body: ResetPassword, session: Session = Depends(get_session)):
    pr = session.exec(select(password_reset_tokens).where(password_reset_tokens.token_hash == hash_token(body.token))).first()
    now = datetime.now(timezone.utc)
    if pr is None or pr.used_at is not None or pr.expires_at <= now:
        raise HTTPException(400, "Invalid or expired reset link")
    user = session.get(users, pr.user_id)
    user.password_hash = get_password_hash(body.new_password)
    pr.used_at = now
    revoke_all_sessions(session, user.id)    
    session.commit()
    return Message(detail="Password changed")

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