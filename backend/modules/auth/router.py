from fastapi import status, Depends, HTTPException, APIRouter
from fastapi.security import OAuth2PasswordRequestForm
from backend.modules.auth.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from sqlmodel import Session, select

from database.database import get_session
from backend.modules.users.schemas import UserCreate, UserPublic, Token
from backend.modules.users.user_model import users, profiles
from sqlalchemy.exc import IntegrityError
from backend.modules.auth.dependencies import get_current_active_user, get_password_hash, get_session, authenticate_user, create_access_token


router = APIRouter(prefix="/auth", tags=["auth"])




@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
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


@router.post("/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), session : Session = Depends(get_session)):
    user = authenticate_user(session, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password", headers={"WWW-Authenticate": "Bearer"})

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