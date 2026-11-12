import uuid

from sqlmodel import Session, select

from backend.modules.payments.models import paid_sales_activations
from backend.modules.payments.schemas import ActivationStatus


def get_activation(session: Session, event_id: uuid.UUID, lock: bool = False) -> paid_sales_activations | None:
    query = select(paid_sales_activations).where(paid_sales_activations.event_id == event_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    return session.exec(query).first()


def paid_sales_active(session: Session, event_id: uuid.UUID, lock: bool = False) -> bool:
    activation = get_activation(session, event_id, lock)
    return activation is not None and activation.status == ActivationStatus.ACTIVE
