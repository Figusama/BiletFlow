from fastapi import status, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from datetime import datetime, timedelta
from jose import JWTError, jwt 
from passlib.context import CryptContext
from backend.modules.auth.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from sqlmodel import Session, select
from datetime import timezone
from database.database import get_session
from backend.modules.users.user_model import users


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth_2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_password(plain_password : str, hashed_password : str):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password : str):
    return pwd_context.hash(password)


def get_user(session: Session, email: str) -> users | None:
    return session.exec(select(users).where(users.email == email)).first()


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
    return user

async def get_current_active_user(current_user : users = Depends(get_current_user)):
    if current_user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")

    return current_user
