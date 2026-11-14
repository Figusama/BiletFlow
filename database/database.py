import os
from dotenv import load_dotenv
from sqlmodel import Session, create_engine
from sqlalchemy import text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)

connect_args = {}
if "supabase.co" in DATABASE_URL or "supabase.com" in DATABASE_URL:
    connect_args["sslmode"] = "require"

engine = create_engine(
    DATABASE_URL,
    echo=True,
    pool_size=2,
    max_overflow=3,
    pool_timeout=40,
    pool_recycle=1800,
    pool_pre_ping=True,
    connect_args=connect_args
)

def get_session():
    with Session(engine) as session:
        yield session
