from sqlalchemy import text, MetaData
from database.database import engine
from backend.modules.users.user_model import users
from backend.modules.events.models import events
from backend.modules.venues.models import venues
from backend.modules.tickets.models import ticket_types
from backend.modules.orders.models import orders
from backend.modules.promotions.models import promo_codes
from backend.modules.payments.models import payments
from backend.modules.audit.models import audit_logs
from backend.modules.refunds.models import refunds
existing = MetaData()
existing.reflect(engine)

with engine.begin() as conn:
    for table in existing.sorted_tables:
        conn.execute(text(f'DROP TABLE IF EXISTS "{table.name}" CASCADE') )