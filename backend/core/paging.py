import re

from fastapi import Response
from sqlalchemy import func
from sqlmodel import Session, select


def like_pattern(text: str) -> str:
    return "%" + re.sub(r"([\\%_])", r"\\\1", text.strip()) + "%"


def page(session: Session, response: Response, query, limit: int, offset: int) -> list:
    response.headers["X-Total-Count"] = str(session.exec(select(func.count()).select_from(query.order_by(None).subquery())).one())
    return list(session.exec(query.limit(limit).offset(offset)).all())
