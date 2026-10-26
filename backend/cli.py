import asyncio
import sys

from sqlmodel import select

from core.ids import public_id
from core.security import create_access_token
from db.session import SessionLocal, create_tables
from modules.categories.models import Category
from modules.users.models import PersonalRole, User
from modules.venues.models import Venue

CATEGORIES = [
    ("Концерты", "concerts"),
    ("Театр", "theatre"),
    ("Спорт", "sport"),
    ("Стендап", "standup"),
    ("Фестивали", "festivals"),
    ("Конференции", "conferences"),
    ("Выставки", "exhibitions"),
    ("Образование", "education"),
    ("Детям", "kids"),
    ("Вечеринки", "parties"),
]

VENUES = [
    ("Barys Arena", "пр. Туран, 57", "Астана", 12000),
    ("Конгресс-холл", "пр. Тауелсиздик, 52", "Астана", 3000),
    ("Дворец Республики", "пр. Достык, 56", "Алматы", 2700),
    ("Almaty Arena", "мкр. Алатау, ул. Момышулы, 16", "Алматы", 12000),
    ("Коворкинг Astana Hub", "пр. Мангилик Ел, 55/8", "Астана", 300),
]


async def set_role(email: str, role: PersonalRole) -> None:
    async with SessionLocal() as session:
        user = (await session.exec(select(User).where(User.email == email))).first()
        if user is None:
            sys.exit(f"No verified user with email {email}")
        user.personal_role = role
        session.add(user)
        await session.commit()
        print(f"{user.public_id} {user.email} -> {role.value}")


async def dev_token(email: str) -> None:
    async with SessionLocal() as session:
        user = (await session.exec(select(User).where(User.email == email))).first()
        if user is None:
            user = User(public_id=public_id("BF-U-"), email=email, password_hash="!")
            session.add(user)
            await session.commit()
        print(f"{user.public_id} {user.email} {user.personal_role.value}")
        print(create_access_token(user.id))


async def seed() -> None:
    async with SessionLocal() as session:
        existing = set((await session.exec(select(Category.slug))).all())
        for name, slug in CATEGORIES:
            if slug not in existing:
                session.add(Category(name=name, slug=slug))

        existing = set((await session.exec(select(Venue.name))).all())
        for name, address, city, capacity in VENUES:
            if name not in existing:
                session.add(Venue(name=name, address=address, city=city, timezone="Asia/Almaty", max_capacity=capacity))

        await session.commit()
        print(f"Seeded {len(CATEGORIES)} categories and {len(VENUES)} venues")


async def main(args: list[str]) -> None:
    await create_tables()
    if args[:1] == ["seed"] and len(args) == 1:
        await seed()
    elif args[:1] == ["dev-token"] and len(args) == 2:
        await dev_token(args[1])
    elif args[:1] == ["promote-admin"] and len(args) == 2:
        await set_role(args[1], PersonalRole.PLATFORM_ADMIN)
    elif args[:1] == ["demote-admin"] and len(args) == 2:
        await set_role(args[1], PersonalRole.USER)
    else:
        sys.exit("usage: python cli.py seed | dev-token <email> | promote-admin <email> | demote-admin <email>")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
