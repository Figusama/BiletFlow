from sqlalchemy import text
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
print(len(list(users.metadata.tables)) + len(list(events.metadata.tables)) + len(list(venues.metadata.tables)) +
    len(list(ticket_types.metadata.tables)) + len(list(orders.metadata.tables)) + len(list(promo_codes.metadata.tables)) +
    len(list(payments.metadata.tables)) + len(list(audit_logs.metadata.tables)) + len(list(refunds.metadata.tables))
    )


with engine.begin() as conn:
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS citext"))

users.metadata.create_all(engine)
payments.metadata.create_all(engine)
audit_logs.metadata.create_all(engine)
events.metadata.create_all(engine)
venues.metadata.create_all(engine)
orders.metadata.create_all(engine)
promo_codes.metadata.create_all(engine)
ticket_types.metadata.create_all(engine)
refunds.metadata.create_all(engine)