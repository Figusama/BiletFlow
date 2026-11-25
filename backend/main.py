import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DataError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import backend.models
from backend.core.config import FRONTEND_URL, MEDIA_ROOT, WORKERS_ENABLED
from backend.modules.auth.router import router as auth
from backend.modules.users.router import router as users
from backend.modules.events.router import router as events
from backend.modules.tickets.router import router as tickets
from backend.modules.orders.router import router as orders
from backend.modules.payments.router import router as payments
from backend.modules.promotions.router import router as promotions
from backend.modules.checkin.router import router as checkin
from backend.modules.analytics.router import router as analytics
from backend.modules.audit.router import router as history
from backend.modules.admin.router import router as admin
from backend.modules.admin.console import router as admin_console
from backend.modules.catalog.router import router as catalog
from backend.modules.invitations.router import router as invitations
from backend.modules.activation.router import router as paid_sales
from backend.modules.refunds.router import router as refunds
from backend.modules.cancellation.router import router as cancellation
from backend.modules.support.router import router as support
from backend.modules.changes.router import router as changes
from backend.modules.jobs.router import router as jobs
from backend.modules.jobs.service import worker_loop
from backend.modules.notifications.router import router as notifications
from backend.modules.applications.router import router as applications, admin_router as admin_applications, duplicate_router as event_duplicates


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(worker_loop()) if WORKERS_ENABLED else None
    yield
    if task:
        task.cancel()


app = FastAPI(title="BiletFlow API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[FRONTEND_URL], allow_credentials=True, allow_methods=["*"], allow_headers=["*"], expose_headers=["X-Total-Count"])


@app.exception_handler(DataError)
def invalid_value(request: Request, exc: DataError):
    return JSONResponse({"detail": "Invalid value"}, status_code=422)


@app.exception_handler(ValueError)
def invalid_text(request: Request, exc: ValueError):
    if "NUL (0x00)" not in str(exc):
        raise exc
    return JSONResponse({"detail": "Text cannot contain NUL characters"}, status_code=422)


app.include_router(auth)
app.include_router(users)
app.include_router(event_duplicates)
app.include_router(events)
app.include_router(tickets)
app.include_router(orders)
app.include_router(payments)
app.include_router(promotions)
app.include_router(checkin)
app.include_router(analytics)
app.include_router(history)
app.include_router(admin)
app.include_router(admin_console)
app.include_router(catalog)
app.include_router(applications)
app.include_router(admin_applications)
app.include_router(invitations)
app.include_router(notifications)
app.include_router(paid_sales)
app.include_router(refunds)
app.include_router(cancellation)
app.include_router(support)
app.include_router(changes)
app.include_router(jobs)

Path(MEDIA_ROOT).mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=MEDIA_ROOT), name="media")
