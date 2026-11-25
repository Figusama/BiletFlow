-- BiletFlow PostgreSQL 16 schema v0.4 integrity handoff candidate. NOT PostgreSQL-executed or production certified.
-- Source of Truth: BiletFlow_database_v1.0_handoff_review.md (2026-11-14).
-- Must be reviewed against SRS and run/tested by backend team before deployment.
-- Cross-row FSM, role checks, admission eligibility, refunds, idempotent provider dispatch,
-- refund attempt caps and inventory capacity remain backend transactional responsibilities.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), public_id varchar(64) NOT NULL UNIQUE, email citext NOT NULL UNIQUE, password_hash text NOT NULL, personal_role text NOT NULL DEFAULT 'USER' CHECK(personal_role IN ('USER','PLATFORM_ADMIN')), is_suspended boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id), full_name text NOT NULL, phone text NOT NULL, avatar_url text, locale text NOT NULL DEFAULT 'ru', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pending_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email citext NOT NULL UNIQUE, password_hash text NOT NULL, full_name text NOT NULL, phone text NOT NULL, verification_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), refresh_token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, used_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, address text NOT NULL, city text NOT NULL, timezone text NOT NULL, max_capacity integer NOT NULL CHECK(max_capacity>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE venue_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venue_id uuid NOT NULL REFERENCES venues(id), name text NOT NULL, version integer NOT NULL CHECK(version>0), is_active boolean NOT NULL DEFAULT true, UNIQUE(id,venue_id), UNIQUE(venue_id,name,version)
);

CREATE TABLE venue_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), layout_id uuid NOT NULL REFERENCES venue_layouts(id), name text NOT NULL, UNIQUE(layout_id,name)
);

CREATE TABLE venue_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), section_id uuid NOT NULL REFERENCES venue_sections(id), label text NOT NULL, UNIQUE(section_id,label)
);

CREATE TABLE venue_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), row_id uuid NOT NULL REFERENCES venue_rows(id), seat_number text NOT NULL, is_accessible boolean NOT NULL DEFAULT false, UNIQUE(row_id,seat_number)
);

CREATE TABLE event_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_number varchar(64) NOT NULL UNIQUE, applicant_user_id uuid NOT NULL REFERENCES users(id), UNIQUE(id,applicant_user_id), title text, description text, venue_id uuid REFERENCES venues(id), venue_name_snapshot text, venue_address_snapshot text, venue_city_snapshot text, starts_at timestamptz, ends_at timestamptz, timezone text, visibility text CHECK(visibility IN ('PUBLIC','UNLISTED','PRIVATE')), seating_mode text CHECK(seating_mode IN ('GENERAL_ADMISSION','ASSIGNED_SEATING')), venue_layout_id uuid REFERENCES venue_layouts(id), responsible_name text, responsible_email citext, responsible_phone text, intends_paid_sales boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING','APPROVED','REJECTED','WITHDRAWN')), submitted_at timestamptz, reviewed_by_user_id uuid REFERENCES users(id), reviewed_at timestamptz, review_comment text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at), CHECK(status <> 'REJECTED' OR length(btrim(coalesce(review_comment,'')))>0)
);

CREATE TABLE event_application_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES users(id), FOREIGN KEY(application_id,user_id) REFERENCES event_applications(id,applicant_user_id), document_type text NOT NULL CHECK(document_type IN ('ORGANIZER_RULES','TICKET_SALES_FINANCIAL_TERMS')), document_version text NOT NULL CHECK(length(btrim(document_version))>0), accepted_at timestamptz NOT NULL DEFAULT now(), UNIQUE(application_id,document_type)
);

CREATE TABLE event_application_categories (
  application_id uuid NOT NULL REFERENCES event_applications(id), category_id uuid NOT NULL REFERENCES categories(id), PRIMARY KEY(application_id,category_id)
);

CREATE TABLE event_application_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES event_applications(id), storage_key text NOT NULL, position integer NOT NULL CHECK(position>=0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(application_id,position)
);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), public_id varchar(64) NOT NULL UNIQUE, slug text NOT NULL UNIQUE, source_application_id uuid NOT NULL UNIQUE REFERENCES event_applications(id), title text NOT NULL, description text NOT NULL, venue_id uuid NOT NULL REFERENCES venues(id), venue_layout_id uuid REFERENCES venue_layouts(id), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, timezone text NOT NULL, visibility text NOT NULL CHECK(visibility IN ('PUBLIC','UNLISTED','PRIVATE')), seating_mode text NOT NULL CHECK(seating_mode IN ('GENERAL_ADMISSION','ASSIGNED_SEATING')), responsible_name text NOT NULL, responsible_email citext NOT NULL, responsible_phone text NOT NULL, public_contact_name text, public_contact_email citext, public_contact_phone text, public_instagram_url text, public_telegram_url text, public_website_url text, refund_policy jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(refund_policy)='object'), status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','COMPLETED','CANCELLED')), is_suspended boolean NOT NULL DEFAULT false, suspended_at timestamptz, suspension_reason text, ga_capacity integer, purchase_terms_version integer NOT NULL DEFAULT 1 CHECK(purchase_terms_version>0), published_at timestamptz, cancelled_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,venue_id), CHECK(ends_at>starts_at), CHECK((seating_mode='GENERAL_ADMISSION' AND ga_capacity>0) OR (seating_mode='ASSIGNED_SEATING' AND ga_capacity IS NULL)), CHECK(NOT is_suspended OR (suspended_at IS NOT NULL AND length(btrim(coalesce(suspension_reason,'')))>0))
);

CREATE TABLE event_categories (
  event_id uuid NOT NULL REFERENCES events(id), category_id uuid NOT NULL REFERENCES categories(id), PRIMARY KEY(event_id,category_id)
);

CREATE TABLE event_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id), storage_key text NOT NULL, position integer NOT NULL CHECK(position>=0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(event_id,position)
);

CREATE TABLE event_user_roles (
  event_id uuid NOT NULL REFERENCES events(id), user_id uuid NOT NULL REFERENCES users(id), event_role text NOT NULL CHECK(event_role IN ('ORGANIZER','EVENT_ADMIN','EVENT_SUPPORT')), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(event_id,user_id,event_role)
);

CREATE TABLE event_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_number varchar(64) NOT NULL UNIQUE, event_id uuid NOT NULL REFERENCES events(id), requested_by_user_id uuid NOT NULL REFERENCES users(id), status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING','APPROVED','REJECTED','WITHDRAWN')), comment text, submitted_at timestamptz, reviewed_by_user_id uuid REFERENCES users(id), reviewed_at timestamptz, review_comment text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,event_id), CHECK(status<>'REJECTED' OR length(btrim(coalesce(review_comment,'')))>0)
);

CREATE TABLE event_cancellation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id), requested_by_user_id uuid NOT NULL REFERENCES users(id), status text NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN')), reason text NOT NULL CHECK(length(btrim(reason))>0), refund_handling_mode text CHECK(refund_handling_mode IN ('AUTOMATIC_FULL','ADMIN_REVIEW')), reviewed_by_user_id uuid REFERENCES users(id), reviewed_at timestamptz, review_comment text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK((status='APPROVED')=(refund_handling_mode IS NOT NULL)), CHECK(status<>'REJECTED' OR length(btrim(coalesce(review_comment,'')))>0)
);

CREATE TABLE ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id), name text NOT NULL, description text, color varchar(16), kind text NOT NULL CHECK(kind IN ('FREE','PAID')), price_minor bigint NOT NULL CHECK(price_minor>=0), quantity_total integer CHECK(quantity_total>0), is_active boolean NOT NULL DEFAULT true, sales_start_at timestamptz NOT NULL, sales_end_at timestamptz NOT NULL, sales_status text NOT NULL DEFAULT 'ACTIVE' CHECK(sales_status IN ('ACTIVE','PAUSED')), max_per_order integer NOT NULL CHECK(max_per_order>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,event_id), CHECK((kind='FREE' AND price_minor=0) OR (kind='PAID' AND price_minor>0)), CHECK(sales_start_at<sales_end_at)
);

CREATE TABLE event_change_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), change_request_id uuid NOT NULL, event_id uuid NOT NULL, field text NOT NULL, target_id uuid, old_value jsonb NOT NULL, new_value jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(change_request_id,event_id) REFERENCES event_change_requests(id,event_id), FOREIGN KEY(target_id,event_id) REFERENCES ticket_types(id,event_id), CHECK((field='CREATE_TICKET_TYPE' AND target_id IS NULL) OR (field IN ('TICKET_TYPE_PRICE','TICKET_TYPE_QUANTITY','TICKET_TYPE_ACTIVE','TICKET_TYPE_SALES_WINDOW','DELETE_TICKET_TYPE') AND target_id IS NOT NULL) OR (field NOT IN ('CREATE_TICKET_TYPE','TICKET_TYPE_PRICE','TICKET_TYPE_QUANTITY','TICKET_TYPE_ACTIVE','TICKET_TYPE_SALES_WINDOW','DELETE_TICKET_TYPE') AND target_id IS NULL))
);

CREATE TABLE event_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id), seat_id uuid NOT NULL REFERENCES venue_seats(id), ticket_type_id uuid, is_enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(event_id,seat_id), UNIQUE(id,event_id), FOREIGN KEY(ticket_type_id,event_id) REFERENCES ticket_types(id,event_id)
);

CREATE TABLE promotional_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id), name text NOT NULL CHECK(length(btrim(name))>0), created_by_user_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,event_id)
);

CREATE TABLE promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id), campaign_id uuid, code citext NOT NULL UNIQUE, discount_type text NOT NULL CHECK(discount_type IN ('PERCENTAGE','FIXED_AMOUNT')), application_scope text NOT NULL CHECK(application_scope IN ('ORDER','SELECTED_TICKET_TYPES')), percentage_bps integer, fixed_amount_minor bigint, max_redemptions integer CHECK(max_redemptions>0), redemption_count integer NOT NULL DEFAULT 0 CHECK(redemption_count>=0), valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL, is_active boolean NOT NULL DEFAULT true, campaign_token uuid UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,event_id), FOREIGN KEY(campaign_id,event_id) REFERENCES promotional_campaigns(id,event_id), CHECK((campaign_id IS NULL)=(campaign_token IS NULL)), CHECK((discount_type='PERCENTAGE' AND percentage_bps BETWEEN 1 AND 10000 AND fixed_amount_minor IS NULL) OR (discount_type='FIXED_AMOUNT' AND fixed_amount_minor>0 AND percentage_bps IS NULL)), CHECK(valid_from<valid_until)
);

CREATE TABLE promo_code_ticket_types (
  promo_code_id uuid NOT NULL, event_id uuid NOT NULL, ticket_type_id uuid NOT NULL, PRIMARY KEY(promo_code_id,ticket_type_id), FOREIGN KEY(promo_code_id,event_id) REFERENCES promo_codes(id,event_id), FOREIGN KEY(ticket_type_id,event_id) REFERENCES ticket_types(id,event_id)
);

CREATE TABLE reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id), user_id uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PROTECTED','CONVERTED','RELEASED')), purchase_terms_version integer NOT NULL CHECK(purchase_terms_version>0), created_at timestamptz NOT NULL DEFAULT now(), converted_at timestamptz, released_at timestamptz, UNIQUE(id,event_id), CHECK(NOT(converted_at IS NOT NULL AND released_at IS NOT NULL))
);

CREATE TABLE reservation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reservation_id uuid NOT NULL, event_id uuid NOT NULL, ticket_type_id uuid NOT NULL, event_seat_id uuid, quantity integer NOT NULL CHECK(quantity>0), created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(reservation_id,event_id) REFERENCES reservations(id,event_id), FOREIGN KEY(ticket_type_id,event_id) REFERENCES ticket_types(id,event_id), FOREIGN KEY(event_seat_id,event_id) REFERENCES event_seats(id,event_id), CHECK(event_seat_id IS NULL OR quantity=1)
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_number varchar(64) NOT NULL UNIQUE, event_id uuid NOT NULL REFERENCES events(id), buyer_user_id uuid NOT NULL REFERENCES users(id), reservation_id uuid NOT NULL UNIQUE, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CONFIRMED','CANCELLED','EXPIRED')), subtotal_minor bigint NOT NULL CHECK(subtotal_minor>=0), discount_minor bigint NOT NULL DEFAULT 0 CHECK(discount_minor>=0), total_minor bigint NOT NULL CHECK(total_minor>=0), promo_code_id uuid, purchase_terms_version integer NOT NULL CHECK(purchase_terms_version>0), refund_policy_snapshot jsonb NOT NULL CHECK(jsonb_typeof(refund_policy_snapshot)='object'), created_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz, cancelled_at timestamptz, expired_at timestamptz, UNIQUE(id,event_id), FOREIGN KEY(reservation_id,event_id) REFERENCES reservations(id,event_id), FOREIGN KEY(promo_code_id,event_id) REFERENCES promo_codes(id,event_id), CHECK(discount_minor<=subtotal_minor AND total_minor=subtotal_minor-discount_minor)
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL, event_id uuid NOT NULL, ticket_type_id uuid NOT NULL, event_seat_id uuid, ticket_type_name text NOT NULL, unit_price_minor bigint NOT NULL CHECK(unit_price_minor>=0), quantity integer NOT NULL CHECK(quantity>0), line_subtotal_minor bigint NOT NULL CHECK(line_subtotal_minor>=0), line_discount_minor bigint NOT NULL DEFAULT 0 CHECK(line_discount_minor>=0), section_snapshot text, row_snapshot text, seat_snapshot text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,order_id), UNIQUE(id,event_seat_id), UNIQUE(id,order_id,event_id,ticket_type_id), FOREIGN KEY(order_id,event_id) REFERENCES orders(id,event_id), FOREIGN KEY(ticket_type_id,event_id) REFERENCES ticket_types(id,event_id), FOREIGN KEY(event_seat_id,event_id) REFERENCES event_seats(id,event_id), CHECK(event_seat_id IS NULL OR quantity=1), CHECK(line_subtotal_minor=unit_price_minor*quantity), CHECK(line_discount_minor<=line_subtotal_minor)
);

CREATE TABLE promo_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), promo_code_id uuid NOT NULL REFERENCES promo_codes(id), order_id uuid NOT NULL UNIQUE REFERENCES orders(id), expires_at timestamptz NOT NULL, released_at timestamptz, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), CHECK(NOT(released_at IS NOT NULL AND consumed_at IS NOT NULL))
);

CREATE TABLE promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), promo_code_id uuid NOT NULL REFERENCES promo_codes(id), order_id uuid NOT NULL UNIQUE REFERENCES orders(id), discount_minor bigint NOT NULL CHECK(discount_minor>=0), redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id), amount_minor bigint NOT NULL CHECK(amount_minor>0), currency text NOT NULL DEFAULT 'KZT' CHECK(currency='KZT'), status text NOT NULL CHECK(status IN ('PENDING','AUTHORIZED','CAPTURING','SUCCEEDED','FAILED','CANCELLED')), pending_operation text CHECK(pending_operation IN ('CAPTURE','CANCEL')), cancellation_reason text CHECK(cancellation_reason IN ('USER_REQUESTED','RESERVATION_EXPIRED','CAPTURE_FAILED')), provider_invoice_id text UNIQUE, provider_payment_id text UNIQUE, idempotency_key text NOT NULL UNIQUE, next_check_at timestamptz, check_failure_count integer NOT NULL DEFAULT 0 CHECK(check_failure_count>=0), processing_fee_minor bigint CHECK(processing_fee_minor>=0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), finalized_at timestamptz, UNIQUE(id,order_id), CHECK(((status='PENDING' AND pending_operation IS NULL AND (cancellation_reason IS NULL OR cancellation_reason IN ('USER_REQUESTED','RESERVATION_EXPIRED'))) OR (status='AUTHORIZED' AND ((pending_operation IS NULL AND cancellation_reason IS NULL) OR (pending_operation='CANCEL' AND cancellation_reason IN ('USER_REQUESTED','RESERVATION_EXPIRED','CAPTURE_FAILED')))) OR (status='CAPTURING' AND pending_operation='CAPTURE' AND cancellation_reason IS NULL) OR (status='FAILED' AND pending_operation IS NULL AND (cancellation_reason IS NULL OR cancellation_reason='CAPTURE_FAILED')) OR (status='CANCELLED' AND pending_operation IS NULL AND cancellation_reason IN ('USER_REQUESTED','RESERVATION_EXPIRED')) OR (status='SUCCEEDED' AND pending_operation IS NULL AND cancellation_reason IS NULL)) IS TRUE), CHECK((status IN ('PENDING','AUTHORIZED','CAPTURING'))=(next_check_at IS NOT NULL))
);

CREATE TABLE payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid REFERENCES payments(id), provider_invoice_id text, payload jsonb NOT NULL DEFAULT '{}'::jsonb, verification_status text NOT NULL CHECK(verification_status IN ('PENDING','VALID','INVALID')), processing_status text NOT NULL CHECK(processing_status IN ('PENDING','PROCESSED','IGNORED','REJECTED')), received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, CHECK(((verification_status='PENDING' AND processing_status='PENDING') OR (verification_status='VALID' AND processing_status IN ('PENDING','PROCESSED','IGNORED')) OR (verification_status='INVALID' AND processing_status='REJECTED')) IS TRUE)
);

CREATE TABLE tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), public_id varchar(64) NOT NULL UNIQUE, order_item_id uuid NOT NULL, order_id uuid NOT NULL, event_id uuid NOT NULL REFERENCES events(id), ticket_type_id uuid NOT NULL, event_seat_id uuid, attendee_name text NOT NULL, section_snapshot text, row_snapshot text, seat_snapshot text, qr_key_id text NOT NULL, status text NOT NULL DEFAULT 'VALID' CHECK(status IN ('VALID','CHECKED_IN','CANCELLED','REFUNDED')), issued_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,event_id), FOREIGN KEY(order_item_id,order_id,event_id,ticket_type_id) REFERENCES order_items(id,order_id,event_id,ticket_type_id), FOREIGN KEY(order_item_id,event_seat_id) REFERENCES order_items(id,event_seat_id), FOREIGN KEY(order_id,event_id) REFERENCES orders(id,event_id), FOREIGN KEY(ticket_type_id,event_id) REFERENCES ticket_types(id,event_id), FOREIGN KEY(event_seat_id,event_id) REFERENCES event_seats(id,event_id)
);

CREATE TABLE check_in_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES tickets(id), checked_in_by uuid NOT NULL REFERENCES users(id), checked_in_at timestamptz NOT NULL DEFAULT now(), reversed_at timestamptz, reversed_by uuid REFERENCES users(id), reversal_reason text, CHECK((reversed_at IS NULL AND reversed_by IS NULL AND reversal_reason IS NULL) OR (reversed_at IS NOT NULL AND reversed_by IS NOT NULL AND length(btrim(coalesce(reversal_reason,'')))>0))
);

CREATE TABLE refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id), requested_by_user_id uuid REFERENCES users(id), source text NOT NULL CHECK(source IN ('CUSTOMER','PLATFORM_ADMIN','EVENT_CANCELLATION','EVENT_CHANGED','SYSTEM_FAST_REFUND','ORGANIZER_INITIATED','EVENT_SUSPENSION')), status text NOT NULL CHECK(status IN ('PENDING','PENDING_ADMIN','APPROVED','REJECTED','WITHDRAWN')), execution_status text CHECK(execution_status IN ('NOT_STARTED','IN_PROGRESS','SUCCEEDED','FAILED_FINAL')), execution_finalized_at timestamptz, event_change_request_id uuid REFERENCES event_change_requests(id), reason_code text, comment text, reviewed_by_user_id uuid REFERENCES users(id), reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,order_id), CHECK((source='EVENT_CHANGED')=(event_change_request_id IS NOT NULL)), CHECK((status='APPROVED')=(execution_status IS NOT NULL)), CHECK(((execution_status IN ('SUCCEEDED','FAILED_FINAL')) IS TRUE AND execution_finalized_at IS NOT NULL) OR ((execution_status IN ('NOT_STARTED','IN_PROGRESS')) IS TRUE AND execution_finalized_at IS NULL) OR (execution_status IS NULL AND execution_finalized_at IS NULL)), CHECK(source<>'EVENT_SUSPENSION' OR status='APPROVED')
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), refund_request_id uuid NOT NULL, order_id uuid NOT NULL, payment_id uuid NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor>0), status text NOT NULL CHECK(status IN ('PENDING','PROCESSING','SUCCEEDED','FAILED','UNKNOWN')), attempt_actor text NOT NULL CHECK(attempt_actor IN ('SYSTEM','PLATFORM_ADMIN','ORGANIZER')), provider_ref text UNIQUE, idempotency_key text NOT NULL UNIQUE, next_retry_at timestamptz, next_check_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), finalized_at timestamptz, FOREIGN KEY(refund_request_id,order_id) REFERENCES refund_requests(id,order_id), FOREIGN KEY(payment_id,order_id) REFERENCES payments(id,order_id)
);

CREATE TABLE private_event_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id), invited_email citext NOT NULL, invited_by_user_id uuid NOT NULL REFERENCES users(id), token_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);

CREATE TABLE event_staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id), invited_user_id uuid NOT NULL REFERENCES users(id), invited_by_user_id uuid NOT NULL REFERENCES users(id), invited_role text NOT NULL CHECK(invited_role IN ('EVENT_ADMIN','EVENT_SUPPORT')), status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','DECLINED','REVOKED')), expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), accepted_at timestamptz, declined_at timestamptz, revoked_at timestamptz
);

CREATE TABLE payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL REFERENCES users(id), owner_type text NOT NULL CHECK(owner_type IN ('INDIVIDUAL','LEGAL_ENTITY')), owner_name text NOT NULL, identifier_encrypted bytea NOT NULL, responsible_person_name text NOT NULL, contact_email citext NOT NULL, contact_phone text NOT NULL, iban_encrypted bytea NOT NULL, bank_name text NOT NULL, account_holder_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,owner_user_id)
);

CREATE TABLE paid_sales_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL UNIQUE REFERENCES events(id), status text NOT NULL CHECK(status IN ('PENDING_VERIFICATION','FEE_PENDING','ACTIVE','SUSPENDED')), approved_request_id uuid, approved_payout_id uuid REFERENCES payout_accounts(id), fee_amount_minor bigint CHECK(fee_amount_minor>0), fee_currency text NOT NULL DEFAULT 'KZT' CHECK(fee_currency='KZT'), paid_terms_version text, paid_terms_accepted_at timestamptz, activated_at timestamptz, suspended_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK((status='PENDING_VERIFICATION' AND approved_request_id IS NULL AND approved_payout_id IS NULL AND fee_amount_minor IS NULL AND activated_at IS NULL) OR (status IN ('FEE_PENDING','ACTIVE','SUSPENDED') AND approved_request_id IS NOT NULL AND approved_payout_id IS NOT NULL AND fee_amount_minor>0 AND paid_terms_version IS NOT NULL AND paid_terms_accepted_at IS NOT NULL)), CHECK((status IN ('ACTIVE','SUSPENDED'))=(activated_at IS NOT NULL))
);

CREATE TABLE paid_sales_activation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), activation_id uuid NOT NULL REFERENCES paid_sales_activations(id), submitted_by_user_id uuid NOT NULL REFERENCES users(id), payout_account_id uuid NOT NULL REFERENCES payout_accounts(id), status text NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')), verification_snapshot jsonb NOT NULL CHECK(jsonb_typeof(verification_snapshot)='object'), terms_version text NOT NULL, terms_accepted_at timestamptz NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now(), reviewed_by_user_id uuid REFERENCES users(id), reviewed_at timestamptz, rejection_reason text, UNIQUE(id,activation_id), CHECK(((status='PENDING' AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL) OR (status='APPROVED' AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NULL) OR (status='REJECTED' AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL AND length(btrim(coalesce(rejection_reason,'')))>0)) IS TRUE)
);

CREATE TABLE activation_fee_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), activation_id uuid NOT NULL REFERENCES paid_sales_activations(id), amount_minor bigint NOT NULL CHECK(amount_minor>0), currency text NOT NULL DEFAULT 'KZT' CHECK(currency='KZT'), status text NOT NULL CHECK(status IN ('PENDING','PROCESSING','UNKNOWN','SUCCEEDED','FAILED')), idempotency_key text NOT NULL UNIQUE, provider_operation_ref text UNIQUE, payment_mode text NOT NULL CHECK(payment_mode IN ('SANDBOX','SIMULATION')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), finalized_at timestamptz, next_check_at timestamptz, CHECK((status IN ('SUCCEEDED','FAILED'))=(finalized_at IS NOT NULL))
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_event_key text NOT NULL UNIQUE, aggregate_type text NOT NULL, aggregate_id uuid NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(payload)='object'), status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','COMPLETED')), created_at timestamptz NOT NULL DEFAULT now(), processing_until timestamptz, processed_at timestamptz, last_error_code text, fanout_cursor_user_id uuid REFERENCES users(id), fanout_cutoff_at timestamptz, CHECK(status<>'PROCESSING' OR processing_until IS NOT NULL)
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), outbox_event_id uuid NOT NULL REFERENCES outbox_events(id), user_id uuid NOT NULL REFERENCES users(id), type text NOT NULL, title text NOT NULL, body text NOT NULL, action_url text, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(outbox_event_id,user_id)
);

CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), outbox_event_id uuid NOT NULL REFERENCES outbox_events(id), recipient_user_id uuid REFERENCES users(id), recipient_email citext NOT NULL, purpose_key text NOT NULL, template_key text NOT NULL, template_version text NOT NULL, locale text NOT NULL, template_data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(template_data)='object'), encrypted_secret_payload bytea, secret_key_version text, invitation_id uuid REFERENCES private_event_invitations(id), status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','SENT','FAILED','SKIPPED')), attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 5), next_attempt_at timestamptz, processing_until timestamptz, provider_message_id text, sent_at timestamptz, skipped_at timestamptz, skip_reason text, last_error_code text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(outbox_event_id,recipient_email,purpose_key), CHECK((encrypted_secret_payload IS NULL)=(secret_key_version IS NULL))
);

CREATE TABLE support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requester_user_id uuid NOT NULL REFERENCES users(id), case_scope text NOT NULL CHECK(case_scope IN ('EVENT_SUPPORT','PLATFORM_SUPPORT')), event_id uuid REFERENCES events(id), order_id uuid, ticket_id uuid, FOREIGN KEY(order_id,event_id) REFERENCES orders(id,event_id), FOREIGN KEY(ticket_id,event_id) REFERENCES tickets(id,event_id), previous_case_id uuid REFERENCES support_cases(id), category text NOT NULL, custom_subject text, status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','RESOLVED')), assigned_to_user_id uuid REFERENCES users(id), escalated_to_platform boolean NOT NULL DEFAULT false, resolved_at timestamptz, last_message_seq bigint NOT NULL DEFAULT 0 CHECK(last_message_seq>=0), requester_last_read_seq bigint NOT NULL DEFAULT 0 CHECK(requester_last_read_seq>=0), support_last_read_seq bigint NOT NULL DEFAULT 0 CHECK(support_last_read_seq>=0), requester_unread_notified boolean NOT NULL DEFAULT false, support_unread_notified boolean NOT NULL DEFAULT false, requester_notice_generation bigint NOT NULL DEFAULT 0 CHECK(requester_notice_generation>=0), support_notice_generation bigint NOT NULL DEFAULT 0 CHECK(support_notice_generation>=0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK(case_scope<>'EVENT_SUPPORT' OR event_id IS NOT NULL), CHECK((status='RESOLVED')=(resolved_at IS NOT NULL)), CHECK(requester_last_read_seq<=last_message_seq AND support_last_read_seq<=last_message_seq)
);

CREATE TABLE support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), support_case_id uuid NOT NULL REFERENCES support_cases(id), message_seq bigint NOT NULL CHECK(message_seq>0), sender_user_id uuid NOT NULL REFERENCES users(id), client_message_id uuid NOT NULL, body text NOT NULL CHECK(length(btrim(body))>0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(support_case_id,message_seq), UNIQUE(support_case_id,sender_user_id,client_message_id)
);

CREATE TABLE support_case_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), support_case_id uuid NOT NULL REFERENCES support_cases(id), actor_user_id uuid REFERENCES users(id), action text NOT NULL, old_status text, new_status text, old_assignee_user_id uuid REFERENCES users(id), new_assignee_user_id uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), metadata jsonb CHECK(metadata IS NULL OR jsonb_typeof(metadata)='object')
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid REFERENCES events(id), actor_type text NOT NULL CHECK(actor_type IN ('USER','SYSTEM')), actor_user_id uuid REFERENCES users(id), action_type text NOT NULL, result text NOT NULL CHECK(result IN ('SUCCESS','DENIED')), entity_type text NOT NULL, entity_id uuid, details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(details)='object'), created_at timestamptz NOT NULL DEFAULT now(), CHECK((actor_type='USER')=(actor_user_id IS NOT NULL))
);

-- Defensive checks and indexes for approved cross-domain invariants.
CREATE UNIQUE INDEX ux_one_organizer_per_event ON event_user_roles(event_id) WHERE event_role='ORGANIZER';
CREATE UNIQUE INDEX ux_pending_event_change ON event_change_requests(event_id) WHERE status='PENDING';
CREATE UNIQUE INDEX ux_pending_cancellation ON event_cancellation_requests(event_id) WHERE status='PENDING';
CREATE UNIQUE INDEX ux_change_event_field ON event_change_request_items(change_request_id,field) WHERE target_id IS NULL AND field<>'CREATE_TICKET_TYPE';
CREATE UNIQUE INDEX ux_change_target_field ON event_change_request_items(change_request_id,field,target_id) WHERE target_id IS NOT NULL;
CREATE UNIQUE INDEX ux_reservation_ga_type ON reservation_items(reservation_id,ticket_type_id) WHERE event_seat_id IS NULL;
CREATE UNIQUE INDEX ux_unfinished_payment ON payments(order_id) WHERE status IN ('PENDING','AUTHORIZED','CAPTURING');
CREATE UNIQUE INDEX ux_one_ticket_per_assigned_order_item ON tickets(order_item_id) WHERE event_seat_id IS NOT NULL;
CREATE UNIQUE INDEX ux_occupying_event_seat ON tickets(event_seat_id) WHERE event_seat_id IS NOT NULL AND status IN ('VALID','CHECKED_IN');
CREATE UNIQUE INDEX ux_effective_checkin ON check_in_records(ticket_id) WHERE reversed_at IS NULL;
CREATE UNIQUE INDEX ux_refund_success_per_order ON refunds(order_id) WHERE status='SUCCEEDED';
CREATE UNIQUE INDEX ux_refund_unfinished_per_order ON refunds(order_id) WHERE status IN ('PENDING','PROCESSING','UNKNOWN');
CREATE UNIQUE INDEX ux_pending_staff_invitation ON event_staff_invitations(event_id,invited_user_id,invited_role) WHERE status='PENDING';
CREATE UNIQUE INDEX ux_pending_activation_review ON paid_sales_activation_requests(activation_id) WHERE status='PENDING';
ALTER TABLE paid_sales_activations ADD CONSTRAINT fk_approved_activation_request FOREIGN KEY(approved_request_id,id) REFERENCES paid_sales_activation_requests(id,activation_id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX ux_unfinished_activation_fee ON activation_fee_payments(activation_id) WHERE status IN ('PENDING','PROCESSING','UNKNOWN');
CREATE UNIQUE INDEX ux_success_activation_fee ON activation_fee_payments(activation_id) WHERE status='SUCCEEDED';
CREATE INDEX ix_refresh_sessions_user_id ON refresh_sessions(user_id);
CREATE INDEX ix_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX ix_event_application_agreements_application_id ON event_application_agreements(application_id);
CREATE INDEX ix_event_change_request_items_change_request_id ON event_change_request_items(change_request_id);
CREATE INDEX ix_event_seats_event_id ON event_seats(event_id);
CREATE INDEX ix_reservation_items_reservation_id ON reservation_items(reservation_id);
CREATE INDEX ix_order_items_order_id ON order_items(order_id);
CREATE INDEX ix_payments_order_id ON payments(order_id);
CREATE INDEX ix_refund_requests_order_id ON refund_requests(order_id);
CREATE INDEX ix_refunds_refund_request_id ON refunds(refund_request_id);
CREATE INDEX ix_tickets_order_id ON tickets(order_id);
CREATE INDEX ix_check_in_records_ticket_id ON check_in_records(ticket_id);
CREATE INDEX ix_notification_deliveries_outbox_event_id ON notification_deliveries(outbox_event_id);
CREATE INDEX ix_support_messages_support_case_id ON support_messages(support_case_id);
CREATE INDEX ix_support_case_history_support_case_id ON support_case_history(support_case_id);
CREATE INDEX ix_audit_event_timeline ON audit_logs(event_id,created_at DESC,id DESC);
CREATE INDEX ix_audit_entity ON audit_logs(entity_type,entity_id,created_at DESC);
CREATE INDEX ix_support_event_queue ON support_cases(event_id,status,assigned_to_user_id,updated_at);
CREATE INDEX ix_support_requester ON support_cases(requester_user_id,updated_at);
CREATE INDEX ix_notifications_user ON notifications(user_id,created_at DESC,id DESC);
CREATE INDEX ix_outbox_worker ON outbox_events(status,processing_until,created_at,id);
CREATE INDEX ix_payment_reconcile ON payments(next_check_at) WHERE status IN ('PENDING','AUTHORIZED','CAPTURING');
CREATE INDEX ix_refund_reconcile ON refunds(next_check_at) WHERE status IN ('PENDING','PROCESSING','UNKNOWN');
CREATE INDEX ix_reservations_event_status_expiry ON reservations(event_id,status,expires_at);
CREATE INDEX ix_reservation_items_seat ON reservation_items(event_seat_id) WHERE event_seat_id IS NOT NULL;
CREATE INDEX ix_orders_event_status ON orders(event_id,status);
CREATE INDEX ix_tickets_order_item ON tickets(order_item_id);
CREATE INDEX ix_refunds_order_status ON refunds(order_id,status);
CREATE INDEX ix_refund_requests_source_status ON refund_requests(source,status,execution_status);
CREATE INDEX ix_staff_invitations_invitee ON event_staff_invitations(invited_user_id,status);
CREATE INDEX ix_event_change_requests_event_status ON event_change_requests(event_id,status);
CREATE INDEX ix_event_cancellation_requests_event_status ON event_cancellation_requests(event_id,status);
CREATE INDEX ix_activation_fee_due ON activation_fee_payments(next_check_at) WHERE status IN ('PENDING','PROCESSING','UNKNOWN');
CREATE INDEX ix_notification_deliveries_due ON notification_deliveries(next_attempt_at) WHERE status IN ('PENDING','FAILED');
COMMIT;
