import os
from dotenv import load_dotenv
from sqlmodel import Session, create_engine
from sqlalchemy import text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        echo=True,
        connect_args={
            "check_same_thread": False
            }
    )
else:
    engine = create_engine(
        DATABASE_URL,
        echo=True,
        pool_size=2,
        max_overflow=3,
        pool_timeout=40,
        pool_recycle=1800,
        pool_pre_ping=True
    )

def get_session():
    with Session(engine) as session:
        yield session
