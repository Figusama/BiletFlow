import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from core.config import settings
from core.errors import register_error_handlers
from core.storage import media_root
from db.session import create_tables
from modules.admin.router import router as admin_router
from modules.auth.router import router as auth_router
from modules.categories.router import router as categories_router
from modules.checkin.router import router as checkin_router
from modules.event_applications.router import router as event_applications_router
from modules.events.change_requests import router as change_requests_router
from modules.events.router import router as events_router
from modules.orders.router import router as orders_router
from modules.staff.router import router as staff_router
from modules.ticket_types.router import router as ticket_types_router
from modules.tickets.router import router as tickets_router
from modules.users.router import router as users_router
from modules.venues.router import router as venues_router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    yield


app = FastAPI(title="BiletFlow API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
register_error_handlers(app)

media_root().mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=media_root()), name="media")

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(categories_router)
app.include_router(venues_router)
app.include_router(events_router)
app.include_router(event_applications_router)
app.include_router(change_requests_router)
app.include_router(ticket_types_router)
app.include_router(staff_router)
app.include_router(orders_router)
app.include_router(tickets_router)
app.include_router(checkin_router)
app.include_router(admin_router)
