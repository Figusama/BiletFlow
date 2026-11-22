from sqlalchemy import text
from database.database import engine
from backend.modules.users.user_model import users, profiles
from backend.modules.events.models import events
from backend.modules.venues.models import venues
from backend.modules.tickets.models import ticket_types
from backend.modules.orders.models import orders
from backend.modules.promotions.models import promo_codes
from backend.modules.payments.models import payments
from backend.modules.audit.models import audit_logs

with engine.begin() as conn:
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS citext"))


users.metadata.drop_all(engine)
payments.metadata.drop_all(engine)
audit_logs.metadata.drop_all(engine)
events.metadata.drop_all(engine)
venues.metadata.drop_all(engine)
orders.metadata.drop_all(engine)
promo_codes.metadata.drop_all(engine)
ticket_types.metadata.drop_all(engine)
