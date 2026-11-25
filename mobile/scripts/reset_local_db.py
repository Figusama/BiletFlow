"""Полностью пересоздаёт ЛОКАЛЬНУЮ базу (схему public). Работает только на localhost."""
import os, sys
from pathlib import Path
from urllib.parse import urlparse

env = Path.cwd() / ".env"  # запускайте из корня репозитория BiletFlow
url = os.environ.get("DATABASE_URL", "")
if not url and env.exists():
    for line in env.read_text(encoding="utf-8").splitlines():
        if line.startswith("DATABASE_URL="):
            url = line.split("=", 1)[1].strip().strip('"').strip("'")
if not url:
    sys.exit("DATABASE_URL не найден в .env")

import re
url = re.sub(r"^postgres(ql)?(\+\w+)?://", "postgresql+psycopg2://", url)
host = urlparse(url).hostname
if host not in ("localhost", "127.0.0.1", "::1"):
    sys.exit(f"СТОП: база не локальная ({host}). Ничего не тронуто.")

from sqlalchemy import create_engine, text
eng = create_engine(url)
with eng.begin() as c:
    c.execute(text("DROP SCHEMA public CASCADE"))
    c.execute(text("CREATE SCHEMA public"))
print("Локальная база очищена:", host)
