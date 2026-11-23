from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import backend.models
from backend.core.config import FRONTEND_URL
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


app = FastAPI(title="BiletFlow API")
app.add_middleware(CORSMiddleware, allow_origins=[FRONTEND_URL], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(auth)
app.include_router(users)
app.include_router(events)
app.include_router(tickets)
app.include_router(orders)
app.include_router(payments)
app.include_router(promotions)
app.include_router(checkin)
app.include_router(analytics)
app.include_router(history)
app.include_router(admin)
