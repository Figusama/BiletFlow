-- =============================================================================
-- BiletFlow — МИНИМАЛЬНОЕ ЯДРО. С этого файла начинается разработка.
--
-- 11 таблиц. Ровно столько, чтобы прошёл основной сценарий:
--   организатор создал событие → выпустил типы билетов → посетитель оформил
--   заказ → получил билет с QR → ивент-админ отсканировал его на входе.
--
-- Чего здесь НЕТ намеренно (это в schema.sql, добавляется позже и по одной):
--   назначенные места, промокоды и Campaign QR, чат поддержки,
--   уведомления, возвраты, аудит, выплаты организаторам.
--
-- Правила те же, что в полной схеме:
--   деньги — BIGINT в тиынах; инварианты живут в базе, а не только в коде.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE event_status  AS ENUM ('draft', 'published', 'cancelled', 'completed');
CREATE TYPE ticket_kind   AS ENUM ('free', 'paid');
CREATE TYPE order_status  AS ENUM ('pending', 'paid', 'cancelled', 'expired');
CREATE TYPE ticket_status AS ENUM ('valid', 'checked_in', 'cancelled');

-- 1 ---------------------------------------------------------------- users ---
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               CITEXT NOT NULL UNIQUE,
    password_hash       TEXT   NOT NULL,              -- argon2id
    full_name           TEXT   NOT NULL,
    is_platform_admin   BOOLEAN NOT NULL DEFAULT FALSE,
    email_verify_token  TEXT,                         -- вместо отдельной таблицы токенов
    email_verified_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2 ---------------------------------------------------- organizer_profiles ---
CREATE TABLE organizer_profiles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    display_name        TEXT NOT NULL,
    contact_email       CITEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3 --------------------------------------------------------------- events ---
CREATE TABLE events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id        UUID NOT NULL REFERENCES organizer_profiles(id) ON DELETE RESTRICT,
    slug                TEXT NOT NULL UNIQUE,
    title               TEXT NOT NULL,
    description         TEXT,
    cover_image_url     TEXT,                         -- ссылка на файл в MinIO
    venue_name          TEXT,                         -- просто строка: зала-схемы пока нет
    venue_address       TEXT,
    starts_at           TIMESTAMPTZ NOT NULL,
    ends_at             TIMESTAMPTZ NOT NULL,
    timezone            TEXT NOT NULL DEFAULT 'Asia/Almaty',
    status              event_status NOT NULL DEFAULT 'draft',
    paid_sales_active   BOOLEAN NOT NULL DEFAULT FALSE,  -- вместо пяти состояний активации
    published_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_event_dates CHECK (ends_at > starts_at)
);
CREATE INDEX idx_events_organizer ON events(organizer_id, status);
CREATE INDEX idx_events_public    ON events(starts_at) WHERE status = 'published';

-- 4 ---------------------------------------------------- staff_assignments ---
-- Кому разрешено сканировать билеты на это событие.
CREATE TABLE staff_assignments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, user_id)
);

-- 5 --------------------------------------------------------- ticket_types ---
CREATE TABLE ticket_types (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    kind                ticket_kind NOT NULL,
    price_minor         BIGINT NOT NULL DEFAULT 0,    -- тиыны: 15 000 ₸ = 1500000
    quantity_total      INT    NOT NULL CHECK (quantity_total >= 0),
    quantity_sold       INT    NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
    max_per_order       INT    NOT NULL DEFAULT 10 CHECK (max_per_order >= 1),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_free_price CHECK ((kind = 'free' AND price_minor = 0)
                                 OR (kind = 'paid' AND price_minor > 0)),
    -- ★ продать больше, чем есть, физически нельзя
    CONSTRAINT ck_inventory  CHECK (quantity_sold <= quantity_total)
);
CREATE INDEX idx_ticket_types_event ON ticket_types(event_id);

-- 6 --------------------------------------------------------------- orders ---
CREATE TABLE orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number        TEXT NOT NULL UNIQUE,          -- BF-2K7X4M
    event_id            UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    buyer_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL = гость
    buyer_email         CITEXT NOT NULL,
    buyer_name          TEXT   NOT NULL,
    status              order_status NOT NULL DEFAULT 'pending',
    total_minor         BIGINT NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
    idempotency_key     TEXT,                          -- защита от двойного клика
    expires_at          TIMESTAMPTZ,                   -- дедлайн удержания инвентаря
    paid_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_orders_idempotency ON orders(idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_orders_event  ON orders(event_id, status);
CREATE INDEX idx_orders_buyer  ON orders(buyer_user_id, created_at DESC);
CREATE INDEX idx_orders_expiry ON orders(expires_at) WHERE status = 'pending';

-- 7 ---------------------------------------------------------- order_items ---
CREATE TABLE order_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    ticket_type_id      UUID NOT NULL REFERENCES ticket_types(id) ON DELETE RESTRICT,
    quantity            INT    NOT NULL CHECK (quantity > 0),
    unit_price_minor    BIGINT NOT NULL CHECK (unit_price_minor >= 0)
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- 8 ------------------------------------------------------------ attendees ---
CREATE TABLE attendees (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    full_name           TEXT NOT NULL,
    email               CITEXT
);
CREATE INDEX idx_attendees_order ON attendees(order_id);

-- 9 -------------------------------------------------------------- tickets ---
CREATE TABLE tickets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_code         TEXT NOT NULL UNIQUE,          -- то, что уходит в QR
    qr_signature        TEXT NOT NULL,                 -- HMAC-SHA256(ticket_code)
    order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    event_id            UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    ticket_type_id      UUID NOT NULL REFERENCES ticket_types(id) ON DELETE RESTRICT,
    attendee_id         UUID REFERENCES attendees(id) ON DELETE SET NULL,
    status              ticket_status NOT NULL DEFAULT 'valid',
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    checked_in_at       TIMESTAMPTZ
);
CREATE INDEX idx_tickets_event ON tickets(event_id, status);
CREATE INDEX idx_tickets_order ON tickets(order_id);

-- 10 ------------------------------------------------------ check_in_records ---
CREATE TABLE check_in_records (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id           UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    performed_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    scanned_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- ★ один билет — один проход. Повторное сканирование упрётся сюда.
CREATE UNIQUE INDEX uq_checkin_once ON check_in_records(ticket_id);
CREATE INDEX idx_checkin_event ON check_in_records(event_id, scanned_at DESC);

-- 11 ------------------------------------------------------------- payments ---
CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    provider_payment_id TEXT,
    status              TEXT NOT NULL DEFAULT 'created'
                        CHECK (status IN ('created','succeeded','failed')),
    amount_minor        BIGINT NOT NULL CHECK (amount_minor >= 0),
    is_simulated        BOOLEAN NOT NULL DEFAULT TRUE, -- академический MVP
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    succeeded_at        TIMESTAMPTZ
);
-- ★ повторная доставка вебхука не выпустит второй комплект билетов
CREATE UNIQUE INDEX uq_payments_provider ON payments(provider_payment_id)
    WHERE provider_payment_id IS NOT NULL;
CREATE INDEX idx_payments_order ON payments(order_id);

-- =============================================================================
-- Четыре защиты, ради которых всё это и написано:
--   ck_inventory          — нельзя продать больше, чем есть
--   ck_free_price         — бесплатный билет не может стоить денег
--   uq_checkin_once       — один билет пропускает ровно один раз
--   uq_payments_provider  — повторный вебхук не выпустит билеты дважды
-- Их нельзя обойти из кода. Всё остальное — обычный CRUD.
-- =============================================================================
