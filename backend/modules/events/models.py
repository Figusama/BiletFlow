import sqlalchemy.dialects.postgresql as pg
from datetime import datetime
import uuid
from sqlmodel import SQLModel, Field, Column
from enum import Enum


class EventRole(str, Enum):
    pass 

#нужен UML не знаю какие роли сделать в ивентах


