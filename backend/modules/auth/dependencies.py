<<<<<<< HEAD
from fastapi import status, Depends, FastAPI, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from datetime import datetime, timedelta
from jose import JWTError, jwt 
from passlib.context import CryptContext
from backend.modules.auth.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from sqlmodel import Session, select
from datetime import timezone
from database.database import get_session
from backend.modules.users.schemas import UserCreate, UserPublic, Token
from backend.modules.users.user_model import users, profiles
from sqlalchemy.exc import IntegrityError

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth_2_scheme = OAuth2PasswordBearer(tokenUrl="token")
app = FastAPI()


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

@app.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate, session : Session = Depends(get_session)):
    user = users(
        email = user_in.email,
        password_hash=get_password_hash(user_in.password)
    )

    session.add(user)


    try:
    
        session.flush()

        profile = profiles(
            user_id = user.id,
            full_name= user_in.full_name,
            phone=user_in.phone,
            locale = user_in.locale
        )

        session.add(profile)
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")


    session.refresh(user)
    session.refresh(profile)
    return UserPublic(
        id=user.id,
        public_id=user.public_id,
        email=user.email,
        personal_role=user.personal_role,
        full_name=profile.full_name
    )


@app.post("/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), session : Session = Depends(get_session)):
    user = authenticate_user(session, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password", headers={"WWW-Authenticate": "Bearer"})

    access_token = create_access_token(user.email)
    return {"access_token": access_token,
            "token_type": "bearer"}


@app.get("/users/me/", response_model=UserPublic)
async def read_users_me(current_user : users = Depends(get_current_active_user), session : Session = Depends(get_session)):
    profile = session.get(profiles, current_user.id)
    return UserPublic(
        id=current_user.id,
        public_id=current_user.public_id,
        email=current_user.email,
        personal_role=current_user.personal_role,
        full_name=profile.full_name if profile else "",
    )


    
=======
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlmodel.ext.asyncio.session import AsyncSession

from core.security import read_access_token
from db.session import get_session
from modules.users.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


async def get_current_user(
    token: str = Depends(oauth2_scheme), session: AsyncSession = Depends(get_session)
) -> User:
    user_id = read_access_token(token)
    user = await session.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(401, "Invalid token", headers={"WWW-Authenticate": "Bearer"})
    return user


async def get_optional_user(
    token: str | None = Depends(optional_oauth2_scheme), session: AsyncSession = Depends(get_session)
) -> User | None:
    if token is None:
        return None
    return await get_current_user(token, session)
>>>>>>> main
