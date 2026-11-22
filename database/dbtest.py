import time
from sqlalchemy import text
from database import engine

for i in range(3):
    t = time.perf_counter()
    with engine.connect() as conn:
        conn.execute(text("select 1"))
    print(f"attempt {i+1}: {time.perf_counter() - t:.2f}s")