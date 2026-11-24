from sqlalchemy import text
from sqlmodel import SQLModel

import backend.models
from database.database import engine

with engine.begin() as conn:
    if conn.execute(text("SELECT to_regtype('citext')")).scalar() is None:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS citext"))
SQLModel.metadata.create_all(engine)
print("Tables:", ", ".join(sorted(SQLModel.metadata.tables)))
