from fastapi import status, Depends, FastAPI, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from datetime import datetime, timedelta
from jose import JWTError, jwt 
from passlib.context import CryptContext


SECRET_KEY = "a1165e173b5ad31079343c98ff5248807e36e877cb3b01bd7de3a9cd15d3ac43"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


db = {
    "tim": {
        "id" : 1,
        "email" : "pornhub@gmail.com",
        "username": "tim",
        "full_name" : "Tim Ruscica",
        "hashed_password": pwd_context.hash("1234567"),
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

class UserCreate(User):
    username : str
    password : str
    email : str
    full_name : str

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


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth_2_scheme)):
    credential_exception = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials", headers={"WWW-Authenticate": "Bearer"})

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username : str = payload.get("sub")
        if username is None:
            raise credential_exception

        token_data = TokenData(username=username)
    except JWTError:
        raise credential_exception

    user = get_user(db, username=token_data.username)
    if user is None:
        raise credential_exception
    return user

async def get_current_active_user(current_user : UserInDB = Depends(get_current_user)):
    if current_user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")

    return current_user


@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password", headers={"WWW-Authenticate": "Bearer"})

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data={"sub": user.username}, expires_delta=access_token_expires)
    return {"access_token": access_token,
            "token_type": "bearer"}


@app.get("/users/me/", response_model=User)
async def read_users_me(current_user : User = Depends(get_current_active_user)):
    return current_user

@app.get("/users/me/items")
async def read_own_items(current_user : User = Depends(get_current_active_user)):
    return [{"item_id": 1, "owner" : current_user}]

@app.post("/register", response_model=User, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate):
    if user_in.username in db:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail = "Username already registered"
        )

    db[user_in.username] = {
        "id": len(db) + 1,
        "username": user_in.username,
        "email": user_in.email,
        "full_name" : user_in.full_name,
        "hashed_password": get_password_hash(user_in.password),
        "disabled": False
    }
    return get_user(db, user_in.username)