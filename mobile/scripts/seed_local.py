"""
Локальный сид BiletFlow для проверки мобильного приложения.

Ничего в репозитории не меняет, пишет только в ЛОКАЛЬНУЮ базу.
Запуск: из корня репозитория BiletFlow, с активированным venv:
    python mobile/scripts/seed_local.py

Скрипт откажется работать, если DATABASE_URL не локальный.
Если репозиторий лежит в другом месте, задайте путь:
    set BILETFLOW_REPO=C:\\путь\\к\\BiletFlow
"""
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

REPO = os.environ.get("BILETFLOW_REPO") or os.getcwd()
if not os.path.isdir(os.path.join(REPO, "backend")):
    sys.exit(f"Не найден репозиторий: {REPO}\nЗапустите из корня репозитория BiletFlow или задайте BILETFLOW_REPO.")

sys.path.insert(0, REPO)
os.chdir(REPO)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(REPO, ".env"))

# ---------- защита: только локальная база ----------
db_url = os.getenv("DATABASE_URL", "")
host = (urlparse(db_url).hostname or "").lower()
if host not in ("localhost", "127.0.0.1", "::1"):
    sys.exit(
        "СТОП: DATABASE_URL указывает не на локальную базу "
        f"(хост: '{host or 'не задан'}').\n"
        "Проверьте .env: нужен a localhost DATABASE_URL"
    )

from sqlmodel import Session, select  # noqa: E402

import backend.models  # noqa: E402,F401  (регистрирует все таблицы)
from backend.core.config import TICKET_QR_CURRENT_KEY  # noqa: E402
from backend.modules.auth.dependencies import get_password_hash  # noqa: E402
from backend.modules.events.models import event_applications, events  # noqa: E402
from backend.modules.events.schemas import (  # noqa: E402
    EventLifecycleStatus, EventStatus, SeatingMode, Visibility,
)
from backend.modules.orders.models import order_items, orders, reservations  # noqa: E402
from backend.modules.orders.schemas import OrderStatus, ReservationStatus  # noqa: E402
from backend.modules.promotions.models import promo_codes, promotional_campaigns  # noqa: E402
from backend.modules.promotions.schemas import ApplicationScope, DiscountType  # noqa: E402
from backend.modules.tickets import service as ticket_service  # noqa: E402
from backend.modules.tickets.models import check_in_records, ticket_types, tickets  # noqa: E402
from backend.modules.tickets.schemas import SalesStatus, TicketKind, TicketStatus  # noqa: E402
from backend.modules.users.user_model import EventRole, Role, event_user_roles, profiles, users  # noqa: E402
from backend.modules.venues.models import venues  # noqa: E402
from database.database import engine  # noqa: E402

ADMIN_EMAIL, ADMIN_PASSWORD = "admin@test.kz", "TestPass123!"
ORG_EMAIL, ORG_PASSWORD = "organizer@test.kz", "TestPass123!"
BUYER_EMAIL, BUYER_PASSWORD = "buyer@test.kz", "TestPass123!"
PLATFORM_EMAIL, PLATFORM_PASSWORD = "platform@test.kz", "TestPass123!"
EVENT_SLUG = "seed-checkin-test"


def make_user(session, email, password, name, phone, role=Role.USER):
    user = users(email=email, password_hash=get_password_hash(password), personal_role=role)
    session.add(user)
    session.flush()
    session.add(profiles(user_id=user.id, full_name=name, phone=phone))
    session.flush()
    return user


def print_result(session, event):
    rows = session.exec(select(tickets).where(tickets.event_id == event.id).order_by(tickets.attendee_name)).all()
    print("\n=== ТЕСТОВЫЙ EVENT ADMIN ===")
    print(f"  email:    {ADMIN_EMAIL}")
    print(f"  password: {ADMIN_PASSWORD}")
    print("\n=== PLATFORM ADMIN (для экранов админки) ===")
    print(f"  email:    {PLATFORM_EMAIL}")
    print(f"  password: {PLATFORM_PASSWORD}")
    print(f"\n=== СОБЫТИЕ: {event.title}  (id {event.id}) ===")
    print("\n=== БИЛЕТЫ (текст для QR-генератора -> сканируйте с экрана) ===")
    for t in rows:
        print(f"\n  {t.attendee_name:<18} статус {t.status.value:<10} {t.public_id}")
        print(f"  QR: {ticket_service.qr_payload(t)}")
    promo = session.exec(select(promo_codes).where(promo_codes.event_id == event.id)).first()
    if promo and promo.campaign_token:
        print("\n=== CAMPAIGN QR (это НЕ билет, сканер должен отклонить) ===")
        print(f"  QR: http://localhost:5173/c/{promo.campaign_token}")
        print("  -> красный Not a ticket")
    print("\nОжидания в приложении:")
    print("  VALID       -> зелёный Valid (потом Already used при повторе, Undo работает)")
    print("  CHECKED_IN  -> сразу Already used (проверка Undo из Search)")
    print("  REFUNDED    -> красный Refunded")
    print("  CANCELLED   -> красный Cancelled")
    print("  любой другой текст -> Invalid ticket")


def main():
    now = datetime.now(timezone.utc)
    with Session(engine) as session:
        existing = session.exec(select(events).where(events.slug == EVENT_SLUG)).first()
        if existing:
            print("Сид уже был выполнен. Данные не дублирую, показываю то, что есть.")
            print_result(session, existing)
            return

        admin = make_user(session, ADMIN_EMAIL, ADMIN_PASSWORD, "Test Event Admin", "+77010000001")
        organizer = make_user(session, ORG_EMAIL, ORG_PASSWORD, "Test Organizer", "+77010000002")
        buyer = make_user(session, BUYER_EMAIL, BUYER_PASSWORD, "Test Buyer", "+77010000003")
        make_user(session, PLATFORM_EMAIL, PLATFORM_PASSWORD, "Test Platform Admin", "+77010000004", Role.PLATFORM_ADMIN)

        venue = venues(name="Test Hall", address="Kabanbay Batyr Ave 10", city="Astana",
                       timezone="Asia/Almaty", max_capacity=500)
        session.add(venue)
        session.flush()

        application = event_applications(
            application_number="BF-EA-SEED1", applicant_user_id=organizer.id,
            title="Seed Check-in Test", status=EventStatus.APPROVED,
        )
        session.add(application)
        session.flush()

        event = events(
            public_id="BF-E-SEED01", slug=EVENT_SLUG, source_application_id=application.id,
            title="Seed Check-in Test", description="Local test event for the check-in app",
            venue_id=venue.id, starts_at=now + timedelta(hours=1), ends_at=now + timedelta(days=3),
            timezone="Asia/Almaty", visibility=Visibility.PUBLIC, seating_mode=SeatingMode.GENERAL_ADMISSION,
            responsible_name="Test Organizer", responsible_email=ORG_EMAIL, responsible_phone="+77010000002",
            status=EventLifecycleStatus.PUBLISHED, ga_capacity=100, published_at=now,
        )
        session.add(event)
        session.flush()

        session.add(event_user_roles(event_id=event.id, user_id=organizer.id, event_role=EventRole.ORGANIZER))
        session.add(event_user_roles(event_id=event.id, user_id=admin.id, event_role=EventRole.EVENT_ADMIN))

        ticket_type = ticket_types(
            event_id=event.id, name="Free entry", kind=TicketKind.FREE, price_minor=0, quantity_total=100,
            sales_start_at=now - timedelta(days=1), sales_end_at=now + timedelta(days=3),
            sales_status=SalesStatus.ACTIVE, max_per_order=6,
        )
        session.add(ticket_type)
        session.flush()

        campaign = promotional_campaigns(event_id=event.id, name="Seed campaign", created_by_user_id=organizer.id)
        session.add(campaign)
        session.flush()
        other_scopes = [x for x in ApplicationScope if x != ApplicationScope.SELECTED_TICKET_TYPES]
        session.add(promo_codes(
            event_id=event.id, campaign_id=campaign.id, code="SEEDPROMO",
            discount_type=DiscountType.PERCENTAGE, application_scope=other_scopes[0],
            percentage_bps=1500, max_redemptions=100,
            valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=3),
            campaign_token=uuid.uuid4(),
        ))
        session.flush()

        reservation = reservations(
            event_id=event.id, user_id=buyer.id, expires_at=now + timedelta(days=1),
            status=getattr(ReservationStatus, "CONVERTED", ReservationStatus.ACTIVE), purchase_terms_version=1,
        )
        session.add(reservation)
        session.flush()

        order = orders(
            order_number="BF-O-SEED01", event_id=event.id, buyer_user_id=buyer.id, reservation_id=reservation.id,
            status=getattr(OrderStatus, "CONFIRMED", OrderStatus.PENDING),
            subtotal_minor=0, discount_minor=0, total_minor=0, purchase_terms_version=1,
            refund_policy_snapshot={}, confirmed_at=now,
        )
        session.add(order)
        session.flush()

        people = [
            ("Aruzhan Serikova", TicketStatus.VALID),
            ("Daniyar Serikov", TicketStatus.VALID),
            ("Timur Akhmetov", TicketStatus.VALID),
            ("Gulnara Ospanova", TicketStatus.REFUNDED),
            ("Saule Bekova", TicketStatus.CANCELLED),
            ("Marat Checkedin", TicketStatus.CHECKED_IN),
        ]
        item = order_items(
            order_id=order.id, event_id=event.id, ticket_type_id=ticket_type.id,
            ticket_type_name=ticket_type.name, unit_price_minor=0, quantity=len(people), line_subtotal_minor=0,
        )
        session.add(item)
        session.flush()

        for i, (name, status) in enumerate(people, start=1):
            ticket = tickets(
                public_id=ticket_service.generate_public_id(), order_item_id=item.id, order_id=order.id,
                event_id=event.id, ticket_type_id=ticket_type.id, attendee_name=name,
                section_snapshot="Main", row_snapshot="A", seat_snapshot=str(i),
                qr_key_id=TICKET_QR_CURRENT_KEY, status=status,
            )
            session.add(ticket)
            session.flush()
            if status == TicketStatus.CHECKED_IN:
                session.add(check_in_records(ticket_id=ticket.id, checked_in_by=admin.id, checked_in_at=now))

        session.commit()
        session.refresh(event)
        print_result(session, event)


if __name__ == "__main__":
    main()
