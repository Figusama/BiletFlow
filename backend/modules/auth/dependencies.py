from fastapi import status, Depends, HTTPException, Response
from fastapi.security import OAuth2PasswordBearer
from datetime import datetime, timedelta
from jose import JWTError, jwt 
from passlib.context import CryptContext
from backend.modules.auth.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_COOKIE, REFRESH_DAYS
from sqlmodel import Session, select
from datetime import timezone
from database.database import get_session
from backend.modules.users.user_model import users, pending_registrations, refresh_sessions
import hashlib
import secrets


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth_2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


def verify_password(plain_password : str, hashed_password : str):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password : str):
    return pwd_context.hash(password)


def get_user(session: Session, email: str) -> users | None:
    return session.exec(select(users).where(users.email == email)).first()


def get_pending_registration(session: Session, email: str) -> pending_registrations | None:
    return session.exec(select(pending_registrations).where(pending_registrations.email == email)).first()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def authenticate_user(session : Session, email: str, password : str) -> users | None:
    user = get_user(session, email=email)
    if user and verify_password(password, user.password_hash):
        return user

    return None

def create_access_token(email : str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    encoded_jwt = jwt.encode({"sub": email, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth_2_scheme), session: Session = Depends(get_session)) -> users:
    credential_exception = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials", headers={"WWW-Authenticate": "Bearer"})

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email : str | None = payload.get("sub")
        if email is None:
            raise credential_exception

    except JWTError:
        raise credential_exception

    user = get_user(session, email=email)
    if user is None:
        raise credential_exception
    if user.is_suspended:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is suspended")
    return user

async def get_current_active_user(current_user : users = Depends(get_current_user)):
    return current_user

def set_refresh_cookie(response: Response, token: str):
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=REFRESH_DAYS * 86400,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/auth"

    )

def create_refresh_session(session, user_id) -> str:
    raw = secrets.token_urlsafe(48)
    session.add(refresh_sessions(
        user_id=user_id,
        refresh_token_hash=hash_token(raw),
        expires_at=datetime.now(timezone.utc) + timedelta(days=REFRESH_DAYS)
    ))
    return raw

def revoke_all_sessions(session, user_id):
    now = datetime.now(timezone.utc)
    for rs in session.exec(select(refresh_sessions).where(refresh_sessions.user_id == user_id, refresh_sessions.revoked_at.is_(None))):
        rs.revoked_at = now