import uuid

from sqlmodel import Session

from backend.modules.audit.models import audit_logs
from database.database import engine


def record(session: Session, *, action: str, entity_type: str, entity_id: uuid.UUID | None, event_id: uuid.UUID | None = None,
           actor_user_id: uuid.UUID | None = None, details: dict | None = None, result: str = "SUCCESS") -> None:
    session.add(audit_logs(
        event_id=event_id,
        actor_type="USER" if actor_user_id else "SYSTEM",
        actor_user_id=actor_user_id,
        action_type=action,
        result=result,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details or {},
    ))


def record_denied(*, action: str, entity_type: str, entity_id: uuid.UUID | None, event_id: uuid.UUID | None, actor_user_id: uuid.UUID | None, details: dict | None = None) -> None:
    with Session(engine) as session:
        record(session, action=action, entity_type=entity_type, entity_id=entity_id, event_id=event_id, actor_user_id=actor_user_id, details=details, result="DENIED")
        session.commit()
