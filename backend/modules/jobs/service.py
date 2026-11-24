import asyncio
import logging

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import text
from sqlmodel import Session, select

from backend.core.clock import db_now
from backend.core.config import WORKER_INTERVAL_SECONDS
from backend.modules.activation.service import process_due_fees
from backend.modules.audit import service as audit
from backend.modules.cancellation import service as cancellation
from backend.modules.events.models import events
from backend.modules.events.schemas import EventLifecycleStatus
from backend.modules.notifications import service as notify
from backend.modules.payments import service as payments
from backend.modules.refunds import service as refunds
from database.database import engine

log = logging.getLogger("biletflow.jobs")

LOCK_KEY = 724501


def complete_finished_events() -> int:
    with Session(engine) as session:
        now = db_now(session)
        ids = session.exec(select(events.id).where(events.status == EventLifecycleStatus.PUBLISHED, events.ends_at <= now).limit(100)).all()
    done = 0
    for event_id in ids:
        with Session(engine) as session:
            event = session.exec(select(events).where(events.id == event_id).with_for_update(skip_locked=True)).first()
            now = db_now(session)
            if event is None or event.status != EventLifecycleStatus.PUBLISHED or event.ends_at > now:
                continue
            event.status = EventLifecycleStatus.COMPLETED
            event.completed_at = now
            session.add(event)
            audit.record(session, action="EVENT_COMPLETED", entity_type="EVENT", entity_id=event.id, event_id=event.id)
            session.commit()
            done += 1
    return done


def reconcile_payments() -> int:
    with Session(engine) as session:
        handled, _ = payments.reconcile_due(session)
        session.commit()
        return handled


JOBS = [
    ("complete_events", complete_finished_events),
    ("reconcile_payments", reconcile_payments),
    ("activation_fees", process_due_fees),
    ("event_cancellations", cancellation.process_cancellations),
    ("refunds", refunds.process_due),
    ("refund_escalation", refunds.escalate_overdue),
    ("email_delivery", notify.deliver_due),
]


def run_all() -> dict[str, int | str]:
    with engine.begin() as conn:
        if not conn.execute(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": LOCK_KEY}).scalar():
            return {"skipped": "another worker is running"}
        results: dict[str, int | str] = {}
        for name, job in JOBS:
            try:
                results[name] = job()
            except Exception as exc:
                log.exception("job %s failed", name)
                results[name] = f"error: {type(exc).__name__}"
        return results


async def worker_loop() -> None:
    while True:
        try:
            await run_in_threadpool(run_all)
        except Exception:
            log.exception("worker cycle failed")
        await asyncio.sleep(WORKER_INTERVAL_SECONDS)
