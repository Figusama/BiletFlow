from database.database import engine
from backend.modules.users.user_model import users, profiles

print("Tables found:", list(users.metadata.tables))
users.metadata.create_all(engine)