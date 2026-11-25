BEGIN;

ALTER TABLE paid_sales_activations
  ADD COLUMN IF NOT EXISTS approved_request_id uuid,
  ADD COLUMN IF NOT EXISTS approved_payout_id uuid REFERENCES payout_accounts(id),
  ADD COLUMN IF NOT EXISTS fee_amount_minor bigint,
  ADD COLUMN IF NOT EXISTS fee_currency text NOT NULL DEFAULT 'KZT',
  ADD COLUMN IF NOT EXISTS paid_terms_version text,
  ADD COLUMN IF NOT EXISTS paid_terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS color varchar(16);

CREATE UNIQUE INDEX IF NOT EXISTS ux_one_organizer_per_event ON event_user_roles(event_id) WHERE event_role = 'ORGANIZER';
CREATE UNIQUE INDEX IF NOT EXISTS ux_pending_event_change ON event_change_requests(event_id) WHERE status = 'PENDING';
CREATE UNIQUE INDEX IF NOT EXISTS ux_unfinished_payment ON payments(order_id) WHERE status IN ('PENDING','AUTHORIZED','CAPTURING');
CREATE UNIQUE INDEX IF NOT EXISTS ux_refund_success_per_order ON refunds(order_id) WHERE status = 'SUCCEEDED';
CREATE UNIQUE INDEX IF NOT EXISTS ux_refund_unfinished_per_order ON refunds(order_id) WHERE status IN ('PENDING','PROCESSING','UNKNOWN');
CREATE UNIQUE INDEX IF NOT EXISTS ux_reservation_ga_type ON reservation_items(reservation_id, ticket_type_id) WHERE event_seat_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_occupying_event_seat ON tickets(event_seat_id) WHERE event_seat_id IS NOT NULL AND status IN ('VALID','CHECKED_IN');
CREATE UNIQUE INDEX IF NOT EXISTS ux_one_ticket_per_assigned_order_item ON tickets(order_item_id) WHERE event_seat_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_effective_checkin ON check_in_records(ticket_id) WHERE reversed_at IS NULL;

COMMIT;
