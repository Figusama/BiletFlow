# Local test data scripts

Only for a **local** development database (Docker Postgres on `localhost`).
The scripts refuse to run if `DATABASE_URL` points anywhere else, so the shared database is never touched.

Run all of them from the **root of the BiletFlow repository** with the backend virtualenv activated.

| Order | Command | What it does |
|---|---|---|
| 1 | `python mobile/scripts/reset_local_db.py` | Drops and recreates the `public` schema (local DB only). Use after the models change. |
| 2 | `python create_tables.py` | Creates the tables from the models. |
| 3 | `python mobile/scripts/seed_local.py` | Creates test accounts, one published event with a free ticket, a promo code and sample tickets. Prints QR payloads. |
| 4 | start the backend: `uvicorn backend.main:app --host 0.0.0.0 --port 8000` | Needed for step 5. |
| 5 | `python mobile/scripts/add_categories.py` | Adds event categories through the API (safe to repeat). |

Test accounts (local seed only), password `TestPass123!`:
`buyer@test.kz` (buyer), `organizer@test.kz` (owns the seed event), `admin@test.kz` (event admin: check-in), `platform@test.kz` (platform admin).

Do **not** run these against the shared database.
