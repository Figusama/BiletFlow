from sqlalchemy import text
from sqlmodel import SQLModel

import backend.models
from database.database import engine


UPGRADES = [
    """DO $$ BEGIN
        CREATE TYPE event_lifecycle_status AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$""",
    """DO $$ BEGIN
        IF (SELECT udt_name FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'status') <> 'event_lifecycle_status' THEN
            ALTER TABLE events ALTER COLUMN status TYPE event_lifecycle_status
                USING (CASE WHEN status::text IN ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED') THEN status::text ELSE 'DRAFT' END)::event_lifecycle_status;
        END IF;
    END $$""",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS ga_capacity INTEGER",
    """DO $$ BEGIN
        ALTER TABLE events ADD CONSTRAINT ck_events_ga_capacity_positive CHECK (ga_capacity IS NULL OR ga_capacity > 0);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$""",
    "ALTER TABLE events ALTER COLUMN venue_layout_id DROP NOT NULL",
    """DO $$ DECLARE col text; BEGIN
        FOREACH col IN ARRAY ARRAY['starts_at', 'ends_at', 'published_at', 'cancelled_at', 'completed_at', 'created_at', 'updated_at'] LOOP
            IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'events' AND column_name = col) = 'timestamp without time zone' THEN
                EXECUTE format('ALTER TABLE events ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE ''UTC''', col, col);
            END IF;
        END LOOP;
    END $$""",
    "ALTER TABLE events ALTER COLUMN created_at SET DEFAULT now()",
    "ALTER TABLE events ALTER COLUMN updated_at SET DEFAULT now()",
    "ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
    """DO $$ BEGIN
        ALTER TABLE ticket_types ADD CONSTRAINT uq_ticket_types_id_event UNIQUE (id, event_id);
    EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$""",
    """DO $$ DECLARE pk text; BEGIN
        SELECT conname INTO pk FROM pg_constraint WHERE conrelid = 'event_user_roles'::regclass AND contype = 'p';
        IF pk IS NOT NULL AND (SELECT array_length(conkey, 1) FROM pg_constraint WHERE conname = pk AND conrelid = 'event_user_roles'::regclass) = 1 THEN
            EXECUTE format('ALTER TABLE event_user_roles DROP CONSTRAINT %I', pk);
            ALTER TABLE event_user_roles ADD PRIMARY KEY (event_id, user_id);
        END IF;
    END $$""",
    """DO $$ BEGIN
        ALTER TABLE event_user_roles ADD CONSTRAINT event_user_roles_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$""",
]


def main() -> None:
    with engine.begin() as conn:
        if conn.execute(text("SELECT to_regtype('citext')")).scalar() is None:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS citext"))
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        for statement in UPGRADES:
            conn.execute(text(statement))
    print("Tables:", ", ".join(sorted(SQLModel.metadata.tables)))


if __name__ == "__main__":
    main()
