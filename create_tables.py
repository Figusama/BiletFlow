from database.database import engine
from backend.modules.users.user_model import users, profiles
from backend.modules.events.models import events
from backend.modules.venues.models import venues
from backend.modules.tickets.models import ticket_types
print("Tables found in users:", list(users.metadata.tables))
print("Tables found in events:", list(events.metadata.tables))
print("Tables found in venues:", list(venues.metadata.tables))
print("Tables found in tables:", list(ticket_types.metadata.tables))
users.metadata.create_all(engine)
events.metadata.create_all(engine)
venues.metadata.create_all(engine)
ticket_types.metadata.create_all(engine)