import uuid
from enum import Enum

class TicketKind(str, Enum):
    FREE = "FREE"
    PAID = "PAID"

class SalesStatus(str, Enum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"