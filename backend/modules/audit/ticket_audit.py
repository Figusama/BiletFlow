import uuid

from sqlmodel import Session

from backend.modules.audit import service as audit


def _record(session: Session, action: str, event_id: uuid.UUID, ticket_type_id: uuid.UUID | None, actor_id: uuid.UUID | None, details: dict) -> None:
    if ticket_type_id is not None:
        details = {"ticket_type_id": str(ticket_type_id), **details}
    audit.record(session, action=action, entity_type="TICKET_TYPE" if ticket_type_id else "EVENT", entity_id=ticket_type_id or event_id, event_id=event_id,
                 actor_user_id=actor_id, details=details)


def price(session: Session, event_id: uuid.UUID, ticket_type_id: uuid.UUID, old: int, new: int, actor_id: uuid.UUID | None) -> None:
    if old != new:
        _record(session, "TICKET_PRICE_CHANGED", event_id, ticket_type_id, actor_id, {"old_price_minor": old, "new_price_minor": new})


def capacity(session: Session, event_id: uuid.UUID, ticket_type_id: uuid.UUID | None, old: int | None, new: int | None, actor_id: uuid.UUID | None) -> None:
    if old != new:
        _record(session, "TICKET_CAPACITY_CHANGED", event_id, ticket_type_id, actor_id, {"old_capacity": old, "new_capacity": new})


def availability(session: Session, event_id: uuid.UUID, ticket_type_id: uuid.UUID, field: str, old, new, actor_id: uuid.UUID | None) -> None:
    if old != new:
        plain = [getattr(v, "value", v) for v in (old, new)]
        _record(session, "TICKET_TYPE_AVAILABILITY_CHANGED", event_id, ticket_type_id, actor_id, {f"old_{field}": plain[0], f"new_{field}": plain[1]})
