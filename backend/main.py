from fastapi import FastAPI
from backend.modules.auth.router import router as auth
from backend.modules.users.router import router as users
from backend.modules.events.router import router as events


app = FastAPI()
app.include_router(auth)
app.include_router(users)
app.include_router(events)