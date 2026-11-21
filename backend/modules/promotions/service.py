import secrets
import uuid
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import and_, exists, func, or_
from sqlmodel import Session, select

from backend.core.clock import as_aware
from backend.modules.orders.models import orders, reservations
from backend.modules.orders.schemas import ReservationStatus
from backend.modules.promotions.models import promo_codes, promo_code_ticket_types, promo_holds, promo_redemptions
from backend.modules.promotions.schemas import ApplicationScope, DiscountType, PromoRejection


PROMO_MESSAGES = {
    PromoRejection.NOT_FOUND: "Promo code not found",
    PromoRejection.INACTIVE: "Promo code is disabled",
    PromoRejection.NOT_STARTED: "Promo code is not active yet",
    PromoRejection.EXPIRED: "Promo code has expired",
    PromoRejection.WRONG_EVENT: "Promo code is not valid for this event",
    PromoRejection.NOT_APPLICABLE: "Promo code does not apply to the selected tickets",
    PromoRejection.EXHAUSTED: "Promo code has reached its redemption limit",
}


@dataclass
class PricedLine:
    key: str
    ticket_type_id: uuid.UUID
    unit_price_minor: int
    quantity: int

    @property
    def subtotal(self) -> int:
        return self.unit_price_minor * self.quantity


@dataclass
class PromoQuote:
    subtotal_minor: int
    discount_minor: int
    rejection: PromoRejection | None = None
    line_discounts: dict[str, int] = field(default_factory=dict)

    @property
    def total_minor(self) -> int:
        return self.subtotal_minor - self.discount_minor


def generate_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "BF" + "".join(secrets.choice(alphabet) for _ in range(6))


def find_promo(session: Session, code: str, for_update: bool = False) -> promo_codes | None:
    query = select(promo_codes).where(promo_codes.code == code.strip().upper())
    if for_update:
        query = query.with_for_update().execution_options(populate_existing=True)
    return session.exec(query).first()


def selected_type_ids(session: Session, promo: promo_codes) -> set[uuid.UUID]:
    return set(session.exec(select(promo_code_ticket_types.ticket_type_id).where(promo_code_ticket_types.promo_code_id == promo.id)).all())


def allocate(total_discount: int, lines: list[PricedLine]) -> dict[str, int]:
    base = sum(line.subtotal for line in lines)
    if base <= 0 or total_discount <= 0:
        return {line.key: 0 for line in lines}
    shares = {}
    remainders = []
    for line in lines:
        product = total_discount * line.subtotal
        shares[line.key] = product // base
        remainders.append((-(product % base), line.key))
    left = total_discount - sum(shares.values())
    for _, key in sorted(remainders)[:left]:
        shares[key] += 1
    return shares


def quote(session: Session, promo: promo_codes | None, event_id: uuid.UUID, lines: list[PricedLine], now: datetime) -> PromoQuote:
    subtotal = sum(line.subtotal for line in lines)
    if promo is None:
        return PromoQuote(subtotal, 0)
    rejection = None
    if promo.event_id != event_id:
        rejection = PromoRejection.WRONG_EVENT
    elif not promo.is_active:
        rejection = PromoRejection.INACTIVE
    elif now < as_aware(promo.valid_from):
        rejection = PromoRejection.NOT_STARTED
    elif now >= as_aware(promo.valid_until):
        rejection = PromoRejection.EXPIRED
    if rejection:
        return PromoQuote(subtotal, 0, rejection)

    if promo.application_scope == ApplicationScope.SELECTED_TICKET_TYPES:
        allowed = selected_type_ids(session, promo)
        eligible = [line for line in lines if line.ticket_type_id in allowed]
    else:
        eligible = list(lines)
    base = sum(line.subtotal for line in eligible)
    if base <= 0:
        return PromoQuote(subtotal, 0, PromoRejection.NOT_APPLICABLE)
    if promo.discount_type == DiscountType.PERCENTAGE:
        discount = base * promo.percentage_bps // 10000
    else:
        discount = min(promo.fixed_amount_minor, base)
    shares = allocate(discount, [line for line in eligible if line.subtotal > 0])
    return PromoQuote(subtotal, discount, None, {line.key: shares.get(line.key, 0) for line in lines})


def effective_holds_count(session: Session, promo_id: uuid.UUID, now: datetime, exclude_order_id: uuid.UUID | None = None) -> int:
    protected = exists().where(and_(
        orders.id == promo_holds.order_id,
        reservations.id == orders.reservation_id,
        reservations.status == ReservationStatus.PROTECTED,
    ))
    query = select(func.count()).select_from(promo_holds).where(
        promo_holds.promo_code_id == promo_id,
        promo_holds.consumed_at.is_(None),
        promo_holds.released_at.is_(None),
        or_(promo_holds.expires_at > now, protected),
    )
    if exclude_order_id is not None:
        query = query.where(promo_holds.order_id != exclude_order_id)
    return session.exec(query).one()


def has_capacity(session: Session, promo: promo_codes, now: datetime, exclude_order_id: uuid.UUID | None = None) -> bool:
    if promo.max_redemptions is None:
        return True
    used = promo.redemption_count + effective_holds_count(session, promo.id, now, exclude_order_id)
    return used < promo.max_redemptions


def place_hold(session: Session, promo: promo_codes, order_id: uuid.UUID, expires_at: datetime) -> promo_holds:
    hold = promo_holds(promo_code_id=promo.id, order_id=order_id, expires_at=expires_at)
    session.add(hold)
    return hold


def release_hold(session: Session, order_id: uuid.UUID, now: datetime) -> None:
    hold = session.exec(select(promo_holds).where(promo_holds.order_id == order_id).with_for_update().execution_options(populate_existing=True)).first()
    if hold and hold.consumed_at is None and hold.released_at is None:
        hold.released_at = now
        session.add(hold)


def redeem(session: Session, promo_id: uuid.UUID, order_id: uuid.UUID, discount_minor: int, now: datetime) -> None:
    if session.exec(select(promo_redemptions).where(promo_redemptions.order_id == order_id)).first():
        return
    promo = session.exec(select(promo_codes).where(promo_codes.id == promo_id).with_for_update().execution_options(populate_existing=True)).one()
    hold = session.exec(select(promo_holds).where(promo_holds.order_id == order_id).with_for_update().execution_options(populate_existing=True)).first()
    if hold and hold.consumed_at is None and hold.released_at is None:
        hold.consumed_at = now
        session.add(hold)
    promo.redemption_count += 1
    session.add(promo)
    session.add(promo_redemptions(promo_code_id=promo_id, order_id=order_id, discount_minor=discount_minor, redeemed_at=now))


def lock_promo(session: Session, promo_id: uuid.UUID) -> promo_codes:
    return session.exec(select(promo_codes).where(promo_codes.id == promo_id).with_for_update().execution_options(populate_existing=True)).one()
