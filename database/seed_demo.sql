BEGIN;

CREATE TABLE IF NOT EXISTS event_categories (
  event_id uuid NOT NULL REFERENCES events(id),
  category_id uuid NOT NULL REFERENCES categories(id),
  PRIMARY KEY (event_id, category_id)
);

CREATE TABLE IF NOT EXISTS event_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id),
  storage_key text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, position)
);

INSERT INTO categories (id, name, slug, is_active) VALUES
  (gen_random_uuid(), 'Concerts', 'concerts', true),
  (gen_random_uuid(), 'Theatre', 'theatre', true),
  (gen_random_uuid(), 'Stand-up', 'stand-up', true),
  (gen_random_uuid(), 'Exhibitions', 'exhibitions', true),
  (gen_random_uuid(), 'Communities', 'communities', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO venues (id, name, address, city, timezone, max_capacity, created_at, updated_at) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'Congress Hall', 'Tauelsizdik Ave 52', 'Astana', 'Asia/Almaty', 3000, now(), now()),
  ('d0000000-0000-4000-8000-000000000002', 'Youth Theatre', 'Kenesary St 1', 'Astana', 'Asia/Almaty', 600, now(), now()),
  ('d0000000-0000-4000-8000-000000000003', 'Stand-up Club', 'Dostyk St 13', 'Astana', 'Asia/Almaty', 250, now(), now()),
  ('d0000000-0000-4000-8000-000000000004', 'Art Space', 'Mangilik El Ave 8', 'Astana', 'Asia/Almaty', 400, now(), now()),
  ('d0000000-0000-4000-8000-000000000005', 'Music Space', 'Abay Ave 48', 'Almaty', 'Asia/Almaty', 300, now(), now()),
  ('d0000000-0000-4000-8000-000000000006', 'Central Park Stage', 'Gogol St 1', 'Almaty', 'Asia/Almaty', 5000, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, public_id, email, password_hash, personal_role, is_suspended, created_at, updated_at) VALUES
  ('d0000000-0000-4000-8000-0000000000a1', 'demo-organizer', 'organizer@biletflow.demo',
   '$2b$12$S6hXco5ZztPquZnuFTQqN.keU3b9zWS7UIyVGiV35kZZ15Qzd/LbW', 'USER', false, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (user_id, full_name, phone, locale, created_at, updated_at) VALUES
  ('d0000000-0000-4000-8000-0000000000a1', 'BiletFlow Demo Organizer', '+77010000000', 'en', now(), now())
ON CONFLICT (user_id) DO NOTHING;

CREATE TEMP TABLE demo_events ON COMMIT DROP AS
SELECT
  ('d0000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid AS event_id,
  ('d0000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid AS application_id,
  'BF-E-DEMO' || lpad(n::text, 2, '0') AS public_id,
  'DEMO-' || lpad(n::text, 4, '0') AS application_number,
  slug, title, description, category_slug,
  ('d0000000-0000-4000-8000-00000000000' || venue_n)::uuid AS venue_id,
  ga_capacity,
  (date_trunc('day', now() AT TIME ZONE 'Asia/Almaty') + make_interval(days => day_offset) + start_time) AT TIME ZONE 'Asia/Almaty' AS starts_at,
  (date_trunc('day', now() AT TIME ZONE 'Asia/Almaty') + make_interval(days => day_offset) + start_time + duration) AT TIME ZONE 'Asia/Almaty' AS ends_at
FROM (VALUES
  (1, 'moldanazar-live-astana', 'Moldanazar. Live in Astana', 'An evening of new songs and fan favourites with a full live band.', 'concerts', 1, 2500, 1, interval '19:00', interval '3 hours'),
  (2, 'hamlet-youth-theatre', '"Hamlet"', 'A modern staging of Shakespeare''s tragedy by the Youth Theatre company.', 'theatre', 2, 500, 2, interval '18:30', interval '3 hours'),
  (3, 'board-games-night', 'Board games night', 'Bring friends or meet new ones: dozens of games, hosts to explain the rules and tea on the house.', 'communities', 4, 80, 2, interval '19:00', interval '3 hours'),
  (4, 'contemporary-kazakh-art', 'Contemporary Kazakh art', 'A free exhibition of paintings, photography and installations by young Kazakh artists.', 'exhibitions', 4, 300, 3, interval '11:00', interval '8 hours'),
  (5, 'aldar-kose-kids-musical', 'Aldar Kose: a musical for kids', 'A cheerful family musical based on the famous folk tales.', 'theatre', 2, 500, 4, interval '12:00', interval '2 hours'),
  (6, 'open-air-almaty', 'Open Air Almaty', 'Five local bands, food trucks and sunset views in the park.', 'concerts', 6, 4000, 5, interval '17:00', interval '5 hours'),
  (7, 'big-stand-up-night', 'Big stand-up night', 'The best comedians of the city test new material in one big show.', 'stand-up', 3, 220, 7, interval '20:00', interval '2 hours'),
  (8, 'jazz-by-candlelight', 'Jazz by candlelight', 'Classic jazz standards performed by a quartet in a candle-lit hall.', 'concerts', 5, 250, 8, interval '19:30', interval '2 hours'),
  (9, 'comedy-battle-almaty', 'Comedy battle', 'Comedians compete in improvised rounds, and the audience picks the winner.', 'stand-up', 5, 250, 9, interval '20:00', interval '2 hours'),
  (10, 'steppe-light-photo', 'Steppe light: photo exhibition', 'Landscape photography from across Kazakhstan, from Charyn to Burabay.', 'exhibitions', 4, 300, 10, interval '10:00', interval '9 hours')
) AS v(n, slug, title, description, category_slug, venue_n, ga_capacity, day_offset, start_time, duration);

CREATE TEMP TABLE demo_ticket_types ON COMMIT DROP AS
SELECT
  ('d0000000-0000-4000-8000-0000000003' || lpad(row_number() OVER ()::text, 2, '0'))::uuid AS id,
  ('d0000000-0000-4000-8000-0000000001' || lpad(event_n::text, 2, '0'))::uuid AS event_id,
  name, description, price_kzt, quantity_total, max_per_order
FROM (VALUES
  (1, 'Standard', 'Seats in the main hall', 12000, 2000, 6),
  (1, 'VIP', 'Front rows and a meet-and-greet after the show', 25000, 100, 4),
  (2, 'Balcony', NULL, 4000, 200, 6),
  (2, 'Parterre', NULL, 6000, 300, 6),
  (3, 'Free entry', 'Registration is required', 0, 80, 2),
  (4, 'Free entry', NULL, 0, 300, 4),
  (5, 'Child', 'Ages 3 to 12', 3000, 300, 6),
  (5, 'Adult', NULL, 4000, 200, 6),
  (6, 'Standard', NULL, 10000, 3500, 6),
  (6, 'Fan zone', 'Standing area next to the stage', 15000, 500, 4),
  (7, 'Standard', NULL, 6000, 180, 6),
  (7, 'Front row', NULL, 9000, 40, 4),
  (8, 'Standard', NULL, 8000, 200, 6),
  (8, 'Table for two', 'Price for two seats at a table', 20000, 25, 2),
  (9, 'Standard', NULL, 5000, 250, 6),
  (10, 'Standard', NULL, 2000, 300, 6)
) AS v(event_n, name, description, price_kzt, quantity_total, max_per_order);

INSERT INTO event_applications (
  id, application_number, applicant_user_id, title, description, venue_id,
  venue_name_snapshot, venue_address_snapshot, venue_city_snapshot,
  starts_at, ends_at, timezone, visibility, seating_mode,
  responsible_name, responsible_email, responsible_phone, intends_paid_sales,
  status, submitted_at, reviewed_at, created_at, updated_at
)
SELECT
  d.application_id, d.application_number, 'd0000000-0000-4000-8000-0000000000a1', d.title, d.description, d.venue_id,
  v.name, v.address, v.city,
  d.starts_at, d.ends_at, 'Asia/Almaty', 'PUBLIC', 'GENERAL_ADMISSION',
  'BiletFlow Demo Organizer', 'organizer@biletflow.demo', '+77010000000',
  EXISTS (SELECT 1 FROM demo_ticket_types t WHERE t.event_id = d.event_id AND t.price_kzt > 0),
  'APPROVED', now(), now(), now(), now()
FROM demo_events d
JOIN venues v ON v.id = d.venue_id
ON CONFLICT (id) DO UPDATE SET starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, updated_at = now();

INSERT INTO events (
  id, public_id, slug, source_application_id, title, description, venue_id,
  starts_at, ends_at, timezone, visibility, seating_mode,
  responsible_name, responsible_email, responsible_phone,
  public_contact_name, public_contact_email, public_contact_phone,
  refund_policy, status, is_suspended, ga_capacity, purchase_terms_version,
  published_at, created_at, updated_at
)
SELECT
  d.event_id, d.public_id, d.slug, d.application_id, d.title, d.description, d.venue_id,
  d.starts_at, d.ends_at, 'Asia/Almaty', 'PUBLIC', 'GENERAL_ADMISSION',
  'BiletFlow Demo Organizer', 'organizer@biletflow.demo', '+77010000000',
  'BiletFlow Demo Organizer', 'organizer@biletflow.demo', '+7 701 000 00 00',
  '{}'::jsonb, 'PUBLISHED', false, d.ga_capacity, 1,
  now(), now(), now()
FROM demo_events d
ON CONFLICT (id) DO UPDATE SET
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at,
  public_contact_name = EXCLUDED.public_contact_name,
  public_contact_email = EXCLUDED.public_contact_email,
  public_contact_phone = EXCLUDED.public_contact_phone,
  updated_at = now();

INSERT INTO event_user_roles (event_id, user_id, event_role, created_at)
SELECT event_id, 'd0000000-0000-4000-8000-0000000000a1', 'ORGANIZER', now()
FROM demo_events
ON CONFLICT DO NOTHING;

INSERT INTO event_application_categories (application_id, category_id)
SELECT d.application_id, c.id
FROM demo_events d
JOIN categories c ON c.slug = d.category_slug
ON CONFLICT DO NOTHING;

INSERT INTO event_application_images (id, application_id, storage_key, position, created_at)
SELECT gen_random_uuid(), application_id, 'events/' || slug || '/0.jpg', 0, now()
FROM demo_events
ON CONFLICT (application_id, position) DO UPDATE SET storage_key = EXCLUDED.storage_key;

INSERT INTO event_categories (event_id, category_id)
SELECT d.event_id, c.id
FROM demo_events d
JOIN categories c ON c.slug = d.category_slug
ON CONFLICT DO NOTHING;

INSERT INTO event_images (event_id, storage_key, position, created_at)
SELECT event_id, 'events/' || slug || '/0.jpg', 0, now()
FROM demo_events
ON CONFLICT (event_id, position) DO UPDATE SET storage_key = EXCLUDED.storage_key;

INSERT INTO ticket_types (
  id, event_id, name, description, kind, price_minor, quantity_total, is_active,
  sales_start_at, sales_end_at, sales_status, max_per_order, created_at, updated_at
)
SELECT
  t.id, t.event_id, t.name, t.description,
  CASE WHEN t.price_kzt = 0 THEN 'FREE' ELSE 'PAID' END,
  t.price_kzt * 100, t.quantity_total, true,
  now() - interval '1 day', d.starts_at, 'ACTIVE', t.max_per_order, now(), now()
FROM demo_ticket_types t
JOIN demo_events d ON d.event_id = t.event_id
ON CONFLICT (id) DO UPDATE SET sales_end_at = EXCLUDED.sales_end_at, updated_at = now();

INSERT INTO paid_sales_activations (id, event_id, status)
SELECT gen_random_uuid(), d.event_id, 'ACTIVE'
FROM demo_events d
WHERE EXISTS (SELECT 1 FROM demo_ticket_types t WHERE t.event_id = d.event_id AND t.price_kzt > 0)
ON CONFLICT (event_id) DO UPDATE SET status = 'ACTIVE';

COMMIT;
