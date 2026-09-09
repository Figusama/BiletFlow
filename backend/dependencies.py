from fastapi import status, Depends, FastAPI, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from datetime import datetime, timedelta
from jose import JWSError, jwt 
from passlib.context import CryptContext


SECRET_KEY = "a1165e173b5ad31079343c98ff5248807e36e877cb3b01bd7de3a9cd15d3ac43"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30



fake_db = {
    "tim": {
        "username" : "tim",
        "full_name" : "Tim Ruscica",
        "email" : "pornhub@gmail.com",
        "hashed_password": "",
        "disabled" : False

    }
}

class Token(BaseModel):
    access_token : str
    token_type : str

class TokenData(BaseModel):
    username : str | None = None

class User(BaseModel):
    username : str
    email : str | None = None
    full_name : str | None = None
    disabled: bool | None = None

class UserInDB(User):
    hashed_password : str


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth_2_scheme = OAuth2PasswordBearer(tokenUrl="token")

app = FastAPI()

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def get_user(db, username: str):
    if username in db:
        user_data = db[username]
        return UserInDB(**user_data)


def authenticate_user(db, user_name: str, password : str):
    user = get_user(db, username=user_name)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user