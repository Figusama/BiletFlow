# BiletFlow Database & Backend Architecture — Source of Truth v0.3

**Status: REVIEW DRAFT — NOT YET APPROVED**  
**Prepared:** 2026-11-08  
**Baseline:** `BiletFlow_database_v0.2_audited.md` (preserved verbatim in Part A).  
**Additional evidence:** BiletFlow architecture handoff 2026-11-04, subsequent approved R/C discussions and PostgreSQL test outcomes; SRS v0.3 Initial Draft reproduced in Appendix S.  
**Authority:** v0.2 remains authoritative until the user approves this v0.3. In this review draft, explicit Part B supersession rules override conflicting Part A passages *only after approval*. Do not interpret old `FINAL` labels in Part A as overriding Part B amendments.

## Read this first — integration status

This is a **consolidation review candidate**, not an executable production migration. The baseline is retained intact for lossless comparison. New domain contracts are collected in Part B; they are not silently backfilled into every old section. Open design gaps are called out explicitly. SQL tests were conducted on isolated `test_r37_*`, `test_c57_*`, and `test_c58_*` models, not the real production schema. SRS mapping is included for review; legal and provider-dependent behavior remains provisional.

## Priority of decisions

1. Mandatory applicable law and binding SRS requirements.
2. Explicitly approved subsequent R/C decisions in Part B, where they supersede the baseline.
3. Unchanged approved v0.2 baseline in Part A.
4. Provider-dependent assumptions remain PROVISIONAL; unverified implementation remains OPEN.

---

# Part A — Preserved v0.2 audited baseline (historical text; see supersessions in Part B)

# BiletFlow Database & Backend Architecture --- Source of Truth

**Document version:** 0.2 (approved checkout/payment architecture; integration details noted separately)\
**Status:** REVIEW DRAFT — authoritative for unchanged v0.1 FINAL sections; v0.2 changes pending final document approval. Sections marked
**FINAL**\
**Last updated:** 2026-10-27\
**Scope of this version:** Original v0.1 foundation plus approved payment DMS, webhook, protected inventory, reconciliation, and processing-fee decisions. Tickets, refunds, full activation and other downstream modules remain pending.

> **Authority rule.** This document is the authoritative source of truth
> for the current BiletFlow database and backend domain architecture. If
> it conflicts with older SQL schemas, ER diagrams, Notion pages,
> implementation assumptions, or earlier drafts, this document takes
> precedence unless it is superseded by a newer approved version.

> **Implementation rule.** Backend code must not invent fields,
> statuses, relationships, or business rules that contradict this
> document. If implementation exposes a missing requirement or
> contradiction, the team must update and approve this document first,
> then implement the change.

## Change summary — v0.1 → v0.2

**Authority:** This revision retains v0.1 as the baseline. Where the v0.2 addenda below explicitly supersede a v0.1 rule, the v0.2 rule controls. This is an architecture specification, **not** a claim that all services have been implemented or end-to-end tested.

| Section | Change | Classification |
|---|---|---|
| §30, §32 | Add `PROTECTED` Reservation and include it in Assigned Seating / GA inventory and capacity calculations | CHANGED |
| §37, §40 | Separate Order creation from Payment creation; clarify retry, cancellation, promo-hold and late AUTH behavior | CHANGED |
| §42 | Creation of Payment is final paid-sales permission check for ordinary suspension; emergency/event cancellation is separate | CHANGED |
| §49–51 | Extend Reservation enum and update pending-domain boundary; Payment FSM is new in §56 | CHANGED |
| Part XVIII | Payment attempt, DMS AUTH/CAPTURE/CANCEL, reconciliation, idempotency and backend implementation invariants | NEW |
| Part XIX | Webhook journal, trust/processing state, safe payload and recovery rules | NEW |
| Part XX | Estimated processing fee paid by Organizer, reporting rules, validation/test scope and open external dependencies | NEW |

**Change labels:** `CHANGED` = existing v0.1 rule changed; `NEW` = added architecture; `CLARIFIED` = existing rule explained without changing meaning. **Approval labels:** `APPROVED` = agreed business rule; `PROVISIONAL` = provider-dependent or not yet validated; `DEFERRED` = later module. These are separate classifications. The sections below carry local change markers for review.

**Commit summary suggestion:** `docs(database): extend v0.1 with approved payment DMS, webhook, protected inventory and fee rules`.

| §40.1–40.2 | Clarify promo-hold protection and retry behavior; ensure effective capacity counts protected holds | CHANGED |
| §52–54 | Correct version roadmap and architecture checkpoint wording | CLARIFIED |

**Change-control policy:** Do not silently implement provisional bank assumptions or not-yet-designed Tickets/Refunds as finalized schema.

---

------------------------------------------------------------------------

## 1. Purpose and design principles

This document records the architectural decisions agreed for BiletFlow
so that backend developers can implement the system without
reconstructing design intent from chats or old diagrams.

The design follows these principles:

1.  **One source of truth per fact.** Avoid storing the same state in
    multiple places when it can be derived reliably.
2.  **Domain states are explicit.** Application review, event lifecycle,
    visibility, ticket sales, paid-sales permission, reservations,
    orders, and payments are separate concepts.
3.  **Security-sensitive transitions happen on the backend.** Frontend
    checks improve UX but never replace backend validation.
4.  **Concurrency is handled by PostgreSQL
    transactions/locking/constraints.** Inventory and limited-use
    resources must not rely on `if available` checks performed outside a
    transaction.
5.  **Historical financial/review data is snapshotted.** Later edits to
    an event or ticket type must not rewrite what an administrator
    approved or what a buyer purchased.
6.  **Files are stored in object storage, not PostgreSQL.** PostgreSQL
    stores metadata/storage keys; MinIO/S3-compatible storage stores
    binaries.
7.  **MVP simplicity without dead ends.** Do not implement unnecessary
    production complexity, but avoid choices that force a database
    redesign for already anticipated features.

------------------------------------------------------------------------

## 2. Global conventions

### 2.1 Identifiers

Internal relational identifiers use UUID primary keys.

Some user-facing entities also receive stable public identifiers:

-   User: `BF-U-...`
-   Event application: `BF-EA-...`
-   Event: `BF-E-...`
-   Event change request: `BF-ECR-...`
-   Order: `BF-O-...`

Public IDs are for display, support, invitations, and human
communication. They do **not** replace UUID primary keys or foreign
keys.

Events additionally use a `slug` for a readable public URL, for example
`/events/imagine-dragons-astana`. A slug is not a relational identifier
and may need regeneration if naming rules change.

### 2.2 Money

All money is stored as integer minor units (`BIGINT`). For KZT, the
application must consistently define the minor-unit convention used by
the payment layer and never use floating-point types for money.

### 2.3 Time

Business timestamps use `TIMESTAMPTZ`. Events also retain an IANA
timezone such as `Asia/Almaty` for correct local presentation and
scheduling semantics.

### 2.4 Soft/history preservation

Published events, confirmed orders, tickets, payments, approvals,
redemptions, and audit history must not be physically deleted as a
normal business action. Terminal states are used instead.

------------------------------------------------------------------------

# Part I --- Identity, Authentication, and Roles

## 3. User model --- FINAL

### 3.1 Role semantics

BiletFlow has four business roles:

-   **ATTENDEE** --- base capabilities of every normal verified user.
-   **EVENT_ADMIN** --- elevated rights for one specific event.
-   **ORGANIZER** --- responsible organizer rights for one specific
    event.
-   **PLATFORM_ADMIN** --- global platform administration rights.

The four roles are **not** stored in one global role column because
organizer and event-admin authority is event-scoped.

### 3.2 Personal role

`users.personal_role` contains only:

``` text
USER
PLATFORM_ADMIN
```

`USER` receives attendee capabilities by default. A Platform Admin also
remains a normal platform user and can become an Organizer for a
particular event through the normal application flow.

### 3.3 Event roles

Event-scoped elevated roles are stored separately in `event_user_roles`:

``` text
event_user_roles
- event_id      FK -> events
- user_id       FK -> users
- event_role    ORGANIZER | EVENT_ADMIN
```

An Event Admin or Organizer can have different roles for different
events. Ordinary attendees are **not** inserted into `event_user_roles`
merely for holding a ticket.

### 3.4 Organizer count

For v0.1, each event has exactly **one responsible Organizer**. The
relation is modeled so that multiple organizers can be supported later
if the team changes the requirement.

------------------------------------------------------------------------

## 4. Verified users only in `users` --- FINAL

A record in `users` means the email address has already been verified.
Unverified registrations do not exist in `users`.

### 4.1 `users`

``` text
users
- id                UUID PK
- public_id         VARCHAR UNIQUE NOT NULL
- email             CITEXT UNIQUE NOT NULL
- password_hash     TEXT NOT NULL
- personal_role     USER | PLATFORM_ADMIN NOT NULL DEFAULT USER
- is_suspended      BOOLEAN NOT NULL DEFAULT FALSE
- created_at        TIMESTAMPTZ NOT NULL
- updated_at        TIMESTAMPTZ NOT NULL
```

Platform Admin cannot be obtained through public registration.

### 4.2 `profiles`

``` text
profiles
- user_id           UUID PK/FK -> users
- full_name         TEXT NOT NULL
- phone             TEXT NOT NULL
- avatar_url        TEXT NULL
- locale            TEXT NOT NULL
- created_at        TIMESTAMPTZ NOT NULL
- updated_at        TIMESTAMPTZ NOT NULL
```

Phone is mandatory profile/contact information, but is **not** an
authentication credential:

-   no login by phone;
-   no SMS password reset;
-   no phone verification requirement in v0.1;
-   phone is not required to be unique.

Frontend should use a Kazakhstan-friendly input mask. Backend must still
validate and store a canonical format; frontend validation alone is not
trusted.

------------------------------------------------------------------------

## 5. Pending registration and email verification --- FINAL

### 5.1 Purpose

A user may submit registration data, close the browser, and verify the
email later. Therefore all data needed to finish registration must be
persisted on the backend before verification.

### 5.2 `pending_registrations`

``` text
pending_registrations
- id                   UUID PK
- email                CITEXT UNIQUE NOT NULL
- password_hash        TEXT NOT NULL
- full_name            TEXT NOT NULL
- phone                TEXT NOT NULL
- verification_hash    TEXT UNIQUE NOT NULL
- expires_at           TIMESTAMPTZ NOT NULL
- created_at           TIMESTAMPTZ NOT NULL
- updated_at           TIMESTAMPTZ NOT NULL
```

Raw verification tokens are never stored. Only a cryptographic hash is
stored.

### 5.3 Registration flow

1.  User submits email, password, full name, and phone.
2.  Backend hashes the password with the approved password-hashing
    algorithm.
3.  Backend generates a random verification secret and stores only its
    hash.
4.  Backend inserts/updates `pending_registrations`.
5.  Email service sends the raw verification link.
6.  No access JWT or refresh session is issued.
7.  User cannot use authenticated BiletFlow functionality before
    verification.

### 5.4 Repeated registration for the same unverified email

If the same email registers again before verification:

-   do not create a second pending record;
-   update pending full name/phone/password with the latest submitted
    values;
-   generate a new verification secret/hash;
-   extend/reset verification expiry;
-   invalidate the previous verification link.

The **latest password** is the password that becomes the account
password after successful verification.

### 5.5 Login attempt before verification

If email does not exist in `users`, backend may check
`pending_registrations`.

-   Correct pending email + correct latest password -\> return a
    specific `EMAIL_VERIFICATION_REQUIRED` result and direct frontend to
    verification.
-   Correct email + wrong password -\> ordinary invalid-credentials
    response.
-   Unknown email -\> ordinary invalid-credentials response.

This avoids disclosing pending-registration state to a party who only
knows an email address.

No JWT or refresh token is issued until verification succeeds.

### 5.6 Verification completion

Successful verification runs atomically:

``` text
BEGIN
  INSERT users
  INSERT profiles
  DELETE pending_registration
COMMIT
```

After this transaction succeeds, the system may create the first refresh
session and issue the first access JWT, effectively completing
registration and signing the user in.

------------------------------------------------------------------------

## 6. Access JWT and refresh sessions --- FINAL

### 6.1 Access JWT

Access JWTs are **not stored in PostgreSQL**. They are short-lived
signed tokens. At minimum they identify the user (`sub`) and carry
issue/expiration information.

The client keeps the access token in memory. It must not be treated as a
durable local-storage credential.

### 6.2 Refresh token

Refresh tokens are long-lived random secrets sent in a Secure HttpOnly
cookie. PostgreSQL stores only their hashes.

### 6.3 `refresh_sessions`

``` text
refresh_sessions
- id                  UUID PK
- user_id             UUID FK -> users NOT NULL
- refresh_token_hash  TEXT UNIQUE NOT NULL
- expires_at          TIMESTAMPTZ NOT NULL
- revoked_at          TIMESTAMPTZ NULL
- created_at          TIMESTAMPTZ NOT NULL
```

No device/user-agent display feature is required for MVP.

### 6.4 Multi-device behavior

Each login creates an independent refresh session. A user may be signed
in on multiple devices/browsers simultaneously.

Refreshing one session rotates only that session's refresh token.
Logging out one session revokes only that session.

### 6.5 Refresh-token rotation

On a successful refresh:

1.  Hash the presented refresh token.
2.  Find the matching non-revoked, non-expired session.
3.  Generate a new refresh token.
4.  Replace `refresh_token_hash` in the same session row.
5.  Return a new access JWT and new HttpOnly refresh cookie.

The old refresh token immediately becomes invalid.

### 6.6 Password changes and suspension

Successful password change or password reset revokes **all** active
refresh sessions for that user in the same database transaction as the
password update.

Suspending a user also revokes all active refresh sessions.

Existing stateless access JWTs may remain valid until their short
expiry. Immediate access-token revocation is outside v0.1 scope.

------------------------------------------------------------------------

## 7. Password reset --- FINAL

Password reset applies only to verified accounts in `users`. Pending
registrations use the registration/verification flow instead.

### 7.1 `password_reset_tokens`

``` text
password_reset_tokens
- id           UUID PK
- user_id      UUID FK -> users NOT NULL
- token_hash   TEXT UNIQUE NOT NULL
- expires_at   TIMESTAMPTZ NOT NULL
- used_at      TIMESTAMPTZ NULL
- revoked_at   TIMESTAMPTZ NULL
- created_at   TIMESTAMPTZ NOT NULL
```

Raw reset secrets are sent by email and never stored.

### 7.2 Forgot-password privacy

Forgot-password returns the same public response whether the email
exists or not, preventing account enumeration.

### 7.3 Repeated reset request

A newly issued reset link revokes earlier still-active reset links for
the same user.

### 7.4 Successful reset

Run atomically:

``` text
BEGIN
  validate reset token
  update users.password_hash
  mark reset token used
  revoke all refresh_sessions for user
COMMIT
```

Do not automatically authenticate the user after password reset; require
login with the new password.

------------------------------------------------------------------------

# Part II --- Event Applications, Events, and Moderation

## 8. Event application concept --- FINAL

A user does not receive a permanent global Organizer role. A verified
user applies to conduct a **specific event**. Approval creates the event
and makes the applicant the responsible Organizer of that event.

``` text
USER
 -> EVENT APPLICATION
 -> PLATFORM ADMIN REVIEW
 -> APPROVED
 -> EVENT CREATED (DRAFT)
 -> applicant receives ORGANIZER role for that event
```

### 8.1 Application lifecycle

``` text
DRAFT -> PENDING -> APPROVED
                 -> REJECTED
                 -> WITHDRAWN
```

Rules:

-   `DRAFT`: applicant may freely edit any application field.
-   Submit validates completeness and moves to `PENDING`.
-   `PENDING`: application content is immutable.
-   Applicant may withdraw a pending application.
-   Platform Admin may approve or reject a pending application.
-   `APPROVED`, `REJECTED`, and `WITHDRAWN` applications are historical
    immutable records.
-   A rejected application is not reopened. UI may create a new draft
    prefilled from it.

### 8.2 Self-approval prohibition

A Platform Admin cannot approve their own event application. This is
enforced in backend service logic. At least two Platform Admin accounts
can be used in development/testing when necessary.

------------------------------------------------------------------------

## 9. `event_applications` --- FINAL design intent

Draft-friendly fields may be nullable in the database; completeness is
enforced when submitting.

``` text
event_applications
- id                          UUID PK
- application_number          VARCHAR UNIQUE NOT NULL
- applicant_user_id           UUID FK -> users NOT NULL

- title                       TEXT NULL while DRAFT
- description                 TEXT NULL while DRAFT

- venue_id                    UUID FK -> venues NULL while DRAFT
- venue_name_snapshot         TEXT NULL while DRAFT
- venue_address_snapshot      TEXT NULL while DRAFT
- venue_city_snapshot         TEXT NULL while DRAFT

- starts_at                   TIMESTAMPTZ NULL while DRAFT
- ends_at                     TIMESTAMPTZ NULL while DRAFT
- timezone                    TEXT NULL while DRAFT

- visibility                  PUBLIC | UNLISTED | PRIVATE NULL while DRAFT
- seating_mode                GENERAL_ADMISSION | ASSIGNED_SEATING NULL while DRAFT
- venue_layout_id             UUID FK -> venue_layouts NULL

- responsible_name            TEXT NULL while DRAFT
- responsible_email           CITEXT NULL while DRAFT
- responsible_phone           TEXT NULL while DRAFT

- intends_paid_sales          BOOLEAN NOT NULL DEFAULT FALSE

- status                      DRAFT | PENDING | APPROVED | REJECTED | WITHDRAWN

- organizer_terms_version     TEXT NULL
- organizer_terms_accepted_at TIMESTAMPTZ NULL
- submitted_at                TIMESTAMPTZ NULL

- reviewed_by_user_id         UUID FK -> users NULL
- reviewed_at                 TIMESTAMPTZ NULL
- review_comment              TEXT NULL

- created_at                  TIMESTAMPTZ NOT NULL
- updated_at                  TIMESTAMPTZ NOT NULL
```

`intends_paid_sales` is informational only. It does not grant or
permanently restrict paid sales.

### 9.1 Responsible person vs public contact

The application contains the responsible person reviewed by Platform
Admin. Public-facing event contact fields are configured later on the
event and are Organizer-editable operational data.

### 9.2 Venue snapshot

`venue_id` links to the current venue record. Snapshot fields preserve
exactly what venue information was reviewed at application time. The
duplication is intentional for audit/history.

### 9.3 Submit validation

Before `DRAFT -> PENDING`, service validates at least:

-   title present;
-   description present;
-   at least one category;
-   venue present;
-   valid start/end timestamps and `ends_at > starts_at`;
-   visibility selected;
-   seating mode selected;
-   compatible layout selected when Assigned Seating;
-   responsible person fields present;
-   at least one application image;
-   Organizer Terms accepted.

------------------------------------------------------------------------

## 10. Categories --- FINAL

Categories are predefined by BiletFlow/Platform Admin. Organizers select
from the controlled list; they do not enter arbitrary category strings.

``` text
categories
- id          UUID PK
- name        TEXT NOT NULL
- slug        TEXT UNIQUE NOT NULL
- is_active   BOOLEAN NOT NULL
```

Applications use a many-to-many join:

``` text
event_application_categories
- application_id  UUID FK -> event_applications
- category_id     UUID FK -> categories
PRIMARY KEY (application_id, category_id)
```

The intended UI allows repeated `+ Add category` selection until all
available categories are selected; already-selected categories are not
offered again.

Approved events use a corresponding `event_categories` join table.

------------------------------------------------------------------------

## 11. Application/event images --- FINAL storage strategy

Images are stored in MinIO/S3-compatible object storage, not as
PostgreSQL blobs.

### 11.1 Application images

``` text
event_application_images
- id              UUID PK
- application_id  UUID FK -> event_applications NOT NULL
- storage_key     TEXT NOT NULL
- position        INTEGER NOT NULL
- created_at      TIMESTAMPTZ NOT NULL
UNIQUE(application_id, position)
```

`position = 0` is treated as the primary/cover image. Additional images
form the carousel.

### 11.2 Event images

Approved events use `event_images` with the same storage-key/position
concept.

External arbitrary image URLs are not authoritative storage because
external content can disappear or change after approval.

------------------------------------------------------------------------

## 12. Organizer responsibility acceptance --- FINAL

Before application submission, the applicant must accept the current
Organizer Terms / responsibility agreement via checkbox.

Store:

-   `organizer_terms_version`
-   `organizer_terms_accepted_at`

This preserves which terms version was accepted.

During approval, Platform Admin UI requires an explicit confirmation
that the reviewer has reviewed the application and appoints the
applicant as the responsible Organizer of the event. Successful approval
itself records this decision through reviewer identity/timestamp; a
redundant boolean is not required.

------------------------------------------------------------------------

## 13. Application approval transaction --- FINAL

Approval is atomic:

``` text
BEGIN
  application.status = APPROVED
  application.reviewed_by_user_id = current_platform_admin
  application.reviewed_at = now()

  CREATE event from approved application
  CREATE event_user_roles row (applicant, ORGANIZER, event)
COMMIT
```

There must never be an approved application without its event/Organizer
relation, or an event created from an application whose approval
transaction failed.

Rejection requires a non-empty `review_comment`.

------------------------------------------------------------------------

## 14. Event lifecycle --- FINAL

An approved application creates an event in `DRAFT`.

``` text
DRAFT -> PUBLISHED -> COMPLETED
                  -> CANCELLED
```

`PUBLISHED -> DRAFT` (unpublish) is allowed only if **no ticket has ever
been issued for the event**.

Once at least one free or paid ticket has been issued, unpublishing back
to Draft is prohibited. Stopping the event then uses the cancellation
workflow.

### 14.1 Meaning of Event Draft

Event Draft is **not** a second application draft. The event has already
been approved. Draft is the Organizer's configuration stage for
operational data such as:

-   ticket configuration;
-   prices;
-   sales windows;
-   assigned-seat enablement and ticket-type assignment;
-   public contact information;
-   Event Admin invitations;
-   Staff Passes;
-   promotions;
-   Paid Sales Activation.

Approved/moderated fields are not directly editable even while the event
is Draft.

### 14.2 Completion

`COMPLETED` is reached automatically when the event end time passes. It
is stored as a terminal business state for reporting/history, even
though `ends_at` determines when completion should occur.

### 14.3 Cancellation

Cancelled events remain in history and remain visible to affected ticket
holders. They disappear from normal discovery. They are not replaced
with a 404 for users who have legitimate historical access.

------------------------------------------------------------------------

## 15. `events` --- current agreed shape

``` text
events
- id                       UUID PK
- public_id                VARCHAR UNIQUE NOT NULL
- slug                     TEXT UNIQUE NOT NULL
- source_application_id    UUID FK -> event_applications UNIQUE NOT NULL

- title                    TEXT NOT NULL
- description              TEXT NOT NULL

- venue_id                 UUID FK -> venues NOT NULL
- venue_layout_id          UUID FK -> venue_layouts NULL

- starts_at                TIMESTAMPTZ NOT NULL
- ends_at                  TIMESTAMPTZ NOT NULL
- timezone                 TEXT NOT NULL

- visibility               PUBLIC | UNLISTED | PRIVATE NOT NULL
- seating_mode             GENERAL_ADMISSION | ASSIGNED_SEATING NOT NULL

- responsible_name         TEXT NOT NULL
- responsible_email        CITEXT NOT NULL
- responsible_phone        TEXT NOT NULL

- public_contact_name      TEXT NULL
- public_contact_email     CITEXT NULL
- public_contact_phone     TEXT NULL

- status                   DRAFT | PUBLISHED | CANCELLED | COMPLETED NOT NULL
- published_at             TIMESTAMPTZ NULL
- cancelled_at             TIMESTAMPTZ NULL
- completed_at             TIMESTAMPTZ NULL

- created_at               TIMESTAMPTZ NOT NULL
- updated_at               TIMESTAMPTZ NOT NULL
```

Event categories and images live in their own relation tables.

No generic `events.capacity` column is used as the authoritative
capacity source.

------------------------------------------------------------------------

## 16. Event visibility --- FINAL

Visibility is **not** event lifecycle status and is controlled directly
by Organizer. It does not require Platform Admin approval.

``` text
PUBLIC    -> appears in search/catalog and works by direct link
UNLISTED  -> omitted from discovery; direct link works
PRIVATE   -> omitted from discovery; access requires invitation
```

Organizer may switch `PUBLIC <-> UNLISTED <-> PRIVATE` while the event
remains Published.

Existing ticket holders retain access to their purchased/issued ticket
history regardless of later visibility changes.

Detailed private-event invitation tables are not yet designed, but
`PRIVATE` is part of the current event model and must be supported
before the private-event feature is considered complete.

------------------------------------------------------------------------

## 17. Publish readiness --- FINAL rules

Publishing is a backend service operation, not a raw status update.

`publish_event()` validates the event before `DRAFT -> PUBLISHED`.

Common checks include:

-   approved event exists and is currently Draft;
-   title/description/categories/images valid;
-   venue valid;
-   event dates valid and event has not ended;
-   responsible person exists;
-   public contact data required by product UI is configured;
-   valid ticket configuration exists;
-   ticket sales windows are valid.

Additional seating-mode rules are defined below.

### 17.1 Paid-event publication rule

BiletFlow uses one event model; an event is not permanently typed as
FREE or PAID.

If **any** ticket type is `PAID`, the event cannot be published until
Paid Sales Activation for that event is `ACTIVE`.

A fully free event requires no Paid Sales Activation.

Even after publication, every paid checkout must re-check that Paid
Sales Activation remains `ACTIVE`, because Platform Admin may later
suspend paid sales.

------------------------------------------------------------------------

# Part III --- Moderated Event Changes

> **[CHANGED v0.3 | APPROVED BUSINESS RULES | REVIEW DRAFT DDL]** Sections 18–20 supersede their v0.2 counterparts. The approved event-change decisions C01–C59 and GA-01–GA-22 control. Physical migration SQL and full integration tests remain pending.

## 18. Editable vs moderated event data --- CHANGED v0.3

### 18.1 Organizer-editable fields on a published Event

Subject to lifecycle, permissions, technical validation, and audit/history rules, Organizer can edit without an Event Change Request:

- description, categories (from the controlled platform list), and event images;
- visibility and public-facing contact name, email, phone, Instagram URL, Telegram URL, and website URL;
- manual sales pause/resume (not changes to configured sales-window timestamps);
- event staff assignments/invitations, Staff Passes, and promo/campaign settings within their separately approved constraints;
- `event_seats.is_enabled` and seat-to-ticket-type assignments **only before any attendee ticket has ever been issued** for the Event, and only with no conflicting `ACTIVE`/`PROTECTED` Reservations; these changes use inventory locks.

Changes to images are subject to secure file validation and storage in BiletFlow-controlled MinIO/S3. Users may report inappropriate images through Support; Platform Admin may moderate with audit logging. No image Event Change Request or temporary review-image workflow is required for ordinary organizer edits. Existing application-approval image checks remain in force.

### 18.2 Fields requiring an Event Change Request after publication

- `TITLE`, `VENUE`, `START_AT`, `END_AT`;
- responsible person's `RESPONSIBLE_NAME`, `RESPONSIBLE_EMAIL`, `RESPONSIBLE_PHONE` (informational contact, not necessarily a BiletFlow user);
- refund policy changes after first successful sale; prior Orders retain their policy snapshot;
- ticket-type price, optional quantity limit, activation/deactivation, addition and eligible deletion;
- GA total capacity changes and configured sales-window changes;
- Assigned Seating `VENUE_LAYOUT` changes **only before any ticket has ever been issued**, with safe handling of outstanding Reservations/Payments.

For a published Event, ticket price changes affect future purchases only. Existing Orders and Reservations retain their frozen financial terms. Event Change Requests apply to all affected items as a single all-or-nothing package.

### 18.3 Immutable and conditional configuration

- `SEATING_MODE` is immutable after Event Application approval; it cannot be changed through an Event Change Request.
- For Assigned Seating, after the first-ever issued ticket, changing Venue or Venue Layout via ordinary Event Change Request is forbidden; cancellation and creation of a new Event are required.
- After the first-ever issued ticket, Organizer cannot change seat enablement or seat-to-type assignments. Administrative exceptional actions require audit and must not silently alter issued tickets.
- GA venue changes are subject to Platform Admin approval, physical capacity validation, and buyer notification/special refund rules.
- Completed/Cancelled Events cannot be normally edited; exceptional administrative corrections require audit.

The historical threshold means **any ticket ever issued**, including free, cancelled, or refunded tickets; never check only currently valid tickets.

### 18.4 Versioned purchase conditions

`events.purchase_terms_version` increases exactly once when an approved applied package changes at least one of: event date/start time, end time, physical venue, refund policy, or (when permitted) venue layout. Pure ticket price, quantity, description, image, or category changes do not increase it. Reservation and Order preserve the relevant version; Order also preserves an immutable validated `refund_policy_snapshot JSONB`. Applying a change and incrementing the version is atomic. Purchase confirmation, webhooks and reconciliation must reject stale terms and safely resolve financial operations without issuing invalid tickets.

Approved changes to date, start time, or actual GA venue open a 24-hour special full-Order refund window for earlier-version Orders. `reviewed_at` is the timestamp of approval-and-application; deadline is derived as `reviewed_at + interval '24 hours'`. Each material change opens its own window. The special refund must link to the qualifying Change Request and use the existing Refund Service; normal refund rights remain separate. Change of end time alone does not open the special window.

------------------------------------------------------------------------

## 19. Event Change Request --- CHANGED v0.3

### 19.1 Parent request

```text
event_change_requests
- id                    UUID PK
- request_number        VARCHAR UNIQUE NOT NULL
- event_id              UUID FK -> events NOT NULL
- requested_by_user_id  UUID FK -> users NOT NULL
- status                DRAFT | PENDING | APPROVED | REJECTED | WITHDRAWN
- comment               TEXT NULL
- submitted_at          TIMESTAMPTZ NULL
- reviewed_by_user_id   UUID FK -> users NULL
- reviewed_at           TIMESTAMPTZ NULL
- review_comment        TEXT NULL
- created_at            TIMESTAMPTZ NOT NULL
- updated_at            TIMESTAMPTZ NOT NULL
```

One `PENDING` request per Event, enforced by partial UNIQUE. Draft is editable and deletable by its authorized Organizer. Submitted requests are immutable. Organizer can withdraw PENDING before review; Platform Admin may approve or reject the whole package, without rewriting its proposed values. Rejection requires a reason. No auto-approval/rejection timeout. A later request may follow terminal decisions. PENDING change and cancellation requests may coexist; approved cancellation automatically rejects pending changes with reason `EVENT_CANCELLED` in the cancellation transaction. Drafts of a cancelled Event cannot be submitted, but may be viewed/deleted.

### 19.2 Request items and target integrity

```text
event_change_request_items
- id                  UUID PK
- change_request_id   UUID FK -> event_change_requests NOT NULL
- event_id            UUID NOT NULL  -- redundant intentionally for composite FKs
- field               event_change_field NOT NULL
- target_id           UUID NULL      -- existing related object, e.g. Ticket Type
- old_value           JSONB NOT NULL
- new_value           JSONB NOT NULL
- created_at          TIMESTAMPTZ NOT NULL
```

- `(change_request_id, event_id)` references unique `(id, event_id)` in the parent request.
- For existing Ticket Type targets, `(target_id, event_id)` references unique `(id, event_id)` in `ticket_types`.
- Separate partial UNIQUE indexes prevent repeated `(change_request_id, field)` when `target_id IS NULL` and repeated `(change_request_id, field, target_id)` when non-NULL.
- A field/target CHECK distinguishes Event fields (`target_id IS NULL`) from existing Ticket Type fields (`target_id IS NOT NULL`).
- `CREATE_TICKET_TYPE` uses `target_id IS NULL` and validated proposed values; **multiple new types in one request require a separate deterministic item identity/uniqueness design**. The simple `(request_id, field)` NULL-target index would otherwise permit only one creation. This DDL detail remains OPEN; do not silently loosen uniqueness.
- `old_value` and `new_value` are validated against the allowed schema of each field/operation. For create operations `old_value` may use an explicit JSON null value; this is not SQL NULL.
- Backend validates the target's Event ownership, access, existence, status, and all business constraints even when FK/CHECK constraints exist. Other related object types must receive their own appropriate target-integrity strategy; the Ticket Type composite FK does not magically cover them.

### 19.3 Atomic approval and concurrency

In a single database transaction, lock Event then request then required inventory/target rows in a stable order; recheck `PENDING`, Event lifecycle and all proposed values; apply **only specified fields**; increment purchase terms version at most once if required; mark `APPROVED` and set reviewer/time; persist audit and durable notification-work intent; commit. If any mandatory step fails, roll back all changes. Never issue network calls to Halyk or send emails within the database transaction.

A repeated approval of an already approved request must not reapply data, increment version, or duplicate work. Pending requests do not pause sales. At the moment of applying substantial terms, stale in-flight Reservations/Payments follow approved safe-cancellation/reconciliation/Refund rules.

### 19.4 Historical values and notification

Retain old/new values and reviewer identity/time for audit. Buyers receive notification of approved material changes. The event title change is notified but does not itself open the 24-hour special refund window. A rejected/withdrawn request does not change Event data or purchase terms version.

------------------------------------------------------------------------

## 20. Event image management --- CHANGED v0.3

`event_application_images` and `event_images` continue to use storage keys and positions in BiletFlow-controlled MinIO/S3. `position = 0` denotes the cover image. Ordinary Organizer changes to Event images after publication do **not** use Event Change Requests; they are allowed under §18.1, subject to file validation, authorization, and history logging. No arbitrary external image URL is authoritative. Platform Admin moderates violations through Support and audit. The previous v0.2 temporary image-review namespace for Event Change Requests is superseded for these ordinary image changes.

------------------------------------------------------------------------

## 21. Venue/layout changes after ticket issuance --- FINAL

For Assigned Seating, once at least one ticket has been issued,
Organizer cannot change the Venue or Venue Layout through a normal Event
Change Request.

If a venue/layout replacement is required after assigned-seat tickets
exist:

1.  request cancellation of the existing event;
2.  Platform Admin reviews cancellation;
3.  cancel/invalidate existing tickets;
4.  refund paid purchases as applicable;
5.  notify affected users;
6.  submit a new Event Application for the replacement event.

Date/time changes may still use Event Change Request after tickets
exist; if approved, affected ticket holders must later be notified
(notification implementation is pending).

------------------------------------------------------------------------

# Part IV --- Venues and Seating

## 22. Venue model --- FINAL foundation

A Venue is the physical location. A Venue Layout is a seating
configuration of that venue.

``` text
VENUE
  -> VENUE_LAYOUT
      -> SECTION
          -> ROW
              -> SEAT
```

### 22.1 `venues`

Current conceptual fields:

``` text
venues
- id
- name
- address
- city
- timezone
- max_capacity
- created_at
- updated_at
```

`max_capacity` is the physical/safety upper bound for the venue in the
current MVP model.

For v0.1, applicants choose an existing venue. A future
`Request New Venue` workflow is anticipated but not yet designed.

### 22.2 Predefined layout scope

MVP implements one predefined assigned-seating layout, while the schema
supports adding more layouts later without redesign.

Fan zones, arbitrary custom layout editors, and hybrid standing/seated
layout modeling are intentionally out of current scope.

### 22.3 Layout tables

Conceptually:

``` text
venue_layouts
- id
- venue_id
- name
- version
- is_active

venue_sections
- id
- layout_id
- name

venue_rows
- id
- section_id
- label

venue_seats
- id
- row_id
- seat_number
- is_accessible
```

Physical seats do not contain event prices.

------------------------------------------------------------------------

## 23. Seating modes --- CHANGED v0.3 | APPROVED GA-01–GA-04

`GENERAL_ADMISSION` and `ASSIGNED_SEATING` remain the two seating modes. `seating_mode` is immutable after Event Application approval (C59-I).

### 23.1 General Admission

- An Event may have **multiple** GA Ticket Types, including mixed FREE/PAID types.
- `events.ga_capacity INTEGER NULL` is mandatory and positive for GA, and NULL for Assigned Seating.
- GA capacity must not exceed `venues.max_capacity` (backend validates the cross-table bound).
- `ticket_types.quantity_total INTEGER NULL` is an **optional per-type ceiling** for GA. NULL means no separate per-type ceiling; overall `ga_capacity` still applies.
- Each non-NULL type ceiling must be positive. The sum of type ceilings need not equal, or be less than, GA capacity. There need not be an unlimited type.
- A GA reservation can hold several Ticket Types, with one reservation item per selected type. It succeeds or fails as one atomic unit.
- Overall and per-type occupancy count issued tickets that still consume inventory plus effective ACTIVE/PROTECTED holds, **without counting converted reservations and their tickets twice**.
- A successful whole-Order refund of unused tickets releases their capacity and corresponding type quotas; checked-in tickets do not automatically release inventory. Event lifecycle restrictions still prohibit sales for CANCELLED/COMPLETED events.

### 23.2 Assigned Seating

- One or more Ticket Types may be configured; each seat has at most one assigned type.
- Physical layout and configured/sellable inventory are distinct.
- Configured capacity counts enabled `event_seats` with assigned Ticket Type; current sale availability further requires an active type, no issued occupying ticket, no effective hold, and valid sale permissions.
- A seat without an assigned Ticket Type is unsellable, without automatically changing `is_enabled`.
- After the first-ever ticket issuance, Organizer cannot alter seat-to-type assignment or seat enablement. This restriction persists after refunds/cancellations; exceptional Platform Admin actions require Audit Log.
- Disabling a Ticket Type for new sales does not alter seat assignment or `event_seats.is_enabled`, and does not invalidate already issued tickets or automatically cancel existing valid reservations.

------------------------------------------------------------------------

## 24. `event_seats` --- CHANGED v0.3 | APPROVED GA-15–GA-22

For Assigned Seating, the event has one row per physical seat in the selected layout.

```text
event_seats
- id               UUID PK
- event_id         UUID FK -> events NOT NULL
- seat_id          UUID FK -> venue_seats NOT NULL
- ticket_type_id   UUID FK -> ticket_types NULL
- is_enabled       BOOLEAN NOT NULL DEFAULT TRUE
- created_at       TIMESTAMPTZ NOT NULL
- updated_at       TIMESTAMPTZ NOT NULL
UNIQUE(event_id, seat_id)
```

An unassigned seat is unavailable for new sales, regardless of `is_enabled`. Configured capacity is `COUNT(*) WHERE is_enabled AND ticket_type_id IS NOT NULL`; sale availability additionally requires `ticket_types.is_active`, valid sale permissions, and no occupying ticket or effective reservation. A disabled type does not change the configured capacity.

Before first-ever issuance, Organizer may enable/disable seats and assign/reassign types only if no conflicting ACTIVE/PROTECTED reservation exists, under locks shared with issuance. After first issuance, Organizer may not change these assignments or flags, even if all tickets are later refunded. Venue/Layout changes follow C59-K/L; seating mode is immutable after Event Application approval.

### 24.1 Seat pricing

Price belongs to the event Ticket Type, never to a physical `venue_seat`.

------------------------------------------------------------------------

# Part V --- Ticket Types and Sales

## 25. `ticket_types` --- FINAL foundation

``` text
ticket_types
- id               UUID PK
- event_id         UUID FK -> events NOT NULL
- name             TEXT NOT NULL
- description      TEXT NULL
- kind             FREE | PAID NOT NULL
- price_minor      BIGINT NOT NULL
- quantity_total   INTEGER NULL
- is_active        BOOLEAN NOT NULL DEFAULT TRUE
- sales_start_at   TIMESTAMPTZ NOT NULL
- sales_end_at     TIMESTAMPTZ NOT NULL
- sales_status     ACTIVE | PAUSED NOT NULL DEFAULT ACTIVE
- max_per_order    INTEGER NOT NULL
- created_at       TIMESTAMPTZ NOT NULL
- updated_at       TIMESTAMPTZ NOT NULL
```

### 25.1 Price rules

``` text
FREE -> price_minor = 0
PAID -> price_minor > 0
```

### 25.2 Sales windows

Organizer chooses sales start/end times per ticket type.

Required:

``` text
sales_start_at < sales_end_at
sales_end_at <= event.ends_at
```

Sales may continue after the event starts, as long as they end no later
than the event itself.

### 25.3 Manual sales state

Only `ACTIVE | PAUSED` is stored as the Organizer-controlled sales
state.

User-facing states such as `NOT_STARTED`, `ON_SALE`, `ENDED`, and
`SOLD_OUT` are computed from time, inventory, event status, and manual
pause state.

### 25.4 General Admission quantity

`quantity_total` is an optional per-type limit for GA (`NULL` = no individual limit); when present it must be positive. The authoritative shared cap is `events.ga_capacity`, which must not exceed the venue maximum. Multiple GA types may coexist.

### 25.5 Assigned Seating quantity

`quantity_total` is not manually configured. It is derived from:

``` text
COUNT(enabled event_seats assigned to this ticket_type)
```

The sum of computed quantities across assigned-seating ticket types
therefore equals the event's computed capacity.

------------------------------------------------------------------------

## 26. Free and paid sales --- FINAL

BiletFlow does not need separate `FREE_EVENT` and `PAID_EVENT` entities.

Free/paid is a property of ticket types.

-   A free-only event can be configured and published without Paid Sales
    Activation.
-   If at least one paid ticket type exists, Paid Sales Activation must
    be `ACTIVE` before publishing.
-   The one-time activation fee is per event, not per ticket type and
    not a percentage of ticket sales.
-   A user may initially intend a free event and later start Paid Sales
    Activation to introduce paid ticket sales.
-   Creating/configuring a paid ticket type before activation may be
    allowed; selling/publishing with paid inventory is blocked until
    activation is active.

Paid Sales Activation details (verification/payout/fee tables and
complete state machine) are **not yet finalized**. `SUSPENDED` is a
required concept so Platform Admin can stop paid sales after activation.

------------------------------------------------------------------------

# Part VI --- Staff Passes and Admission Separation

## 27. Roles are not admission credentials --- FINAL

System permissions and physical entry are separate concepts.

-   Event role answers: **what may this user do in BiletFlow for this
    event?**
-   Ticket/Staff Pass answers: **may this person enter the event?**

An Event Admin does not automatically become an attendee ticket holder
merely because of the role.

## 28. Staff Pass --- FINAL concept, detailed schema pending

Organizer may issue Staff Passes independently of Event Admin
assignment. Examples include organizer, Event Admin, photographer,
technician, security staff, or another staff member.

Staff Pass is separate from attendee `tickets`.

Agreed behavior:

-   multi-use/reusable;
-   has an active validity period;
-   can be revoked;
-   expiration is preferably computed from `valid_until` rather than
    stored as a manually synchronized status;
-   every scan/use is logged;
-   repeated scans do not consume the pass.

Detailed Staff Pass and scan-record tables will be finalized in the
check-in block.

------------------------------------------------------------------------

# Part VII --- Inventory Reservations

## 29. Unified Reservation model --- FINAL

Both seating modes use the same business entity: `Reservation`.

``` text
RESERVATION = temporary hold on ticket inventory
ORDER       = confirmed checkout intent with frozen composition/prices
PAYMENT     = payment process for a paid order
TICKET      = credential issued after successful order confirmation
```

### 29.1 Reservation begins on explicit confirmation

No database reservation is created merely because the user
clicks/selects inventory in the UI.

General Admission:

``` text
select quantity -> Continue -> reservation starts
```

Assigned Seating:

``` text
select seats locally -> Confirm/Choose seats -> reservation starts
```

This avoids creating reservations for every exploratory click. The
tradeoff is intentional: a seat selected locally may be taken by another
user before the user confirms; backend then returns that it is no longer
available and frontend refreshes the map.

------------------------------------------------------------------------

## 30. `reservations` --- FINAL

> **[CHANGED v0.2]** Adds `PROTECTED` and revises expiry semantics; original v0.1 statuses otherwise retained.

``` text
reservations
- id            UUID PK
- event_id      UUID FK -> events NOT NULL
- user_id       UUID FK -> users NOT NULL
- expires_at    TIMESTAMPTZ NOT NULL
- status        ACTIVE | PROTECTED | CONVERTED | RELEASED NOT NULL
- created_at    TIMESTAMPTZ NOT NULL
- converted_at  TIMESTAMPTZ NULL
- released_at   TIMESTAMPTZ NULL
```

`EXPIRED` is computed:

``` text
status = ACTIVE AND expires_at <= current database time
```

No scheduled status update is required merely to mark expiration.

Meaning:

-   `ACTIVE`: inventory is temporarily held until `expires_at`;
-   `PROTECTED`: timely AUTH was accepted; inventory remains held beyond original `expires_at` until safe financial resolution;
-   `CONVERTED`: successful checkout/order confirmation converted
    inventory into issued tickets;
-   `RELEASED`: hold explicitly released before expiry.

The exact reservation TTL is configuration, not schema. An `ACTIVE` hold is computed expired by time; a `PROTECTED` hold is **not** released merely because the original TTL has passed.

------------------------------------------------------------------------

## 31. `reservation_items` --- FINAL

``` text
reservation_items
- id               UUID PK
- reservation_id   UUID FK -> reservations NOT NULL
- ticket_type_id   UUID FK -> ticket_types NOT NULL
- event_seat_id    UUID FK -> event_seats NULL
- quantity         INTEGER NOT NULL
- created_at       TIMESTAMPTZ NOT NULL
```

Rules:

### General Admission

``` text
event_seat_id = NULL
quantity >= 1
```

A General Admission reservation may have several items, one per distinct Ticket Type. A partial UNIQUE index on `(reservation_id, ticket_type_id) WHERE event_seat_id IS NULL` prevents duplicate GA lines. All item types must belong to the reservation Event.

### Assigned Seating

``` text
event_seat_id IS NOT NULL
quantity = 1
```

Each concrete seat is represented by its own reservation item.

A reservation may contain inventory for only one event. Backend
validates that reservation, ticket types, and event seats all belong to
the same event.

------------------------------------------------------------------------

## 32. Reservation concurrency --- FINAL implementation rule

Inventory reservation must be atomic and concurrency-safe.

### 32.1 Assigned Seating

When confirming selected seats:

1.  Begin transaction.
2.  Lock relevant `event_seats` rows (`SELECT ... FOR UPDATE` or
    equivalent ordered locking strategy).
3.  Verify every seat is enabled.
4.  Verify no issued ticket already owns the seat.
5.  Verify no non-expired `ACTIVE` or any `PROTECTED` reservation item currently holds the
    seat.
6.  Create reservation + items.
7.  Commit.

Concurrent attempts for the same seat serialize through row locking;
only one succeeds.

### 32.2 General Admission — CHANGED v0.3 | APPROVED GA-01–GA-05

1. Begin a short PostgreSQL transaction.
2. Lock the Event row as the shared GA inventory serialization point; lock selected Ticket Type rows in deterministic order.
3. Validate Event status, sale windows, type activity, and other sale permissions.
4. Calculate overall occupied GA inventory across **all types**: issued tickets that still consume inventory + non-expired ACTIVE and all PROTECTED holds; exclude converted reservations from hold counts to avoid double counting.
5. Check `occupied_total + requested_total <= events.ga_capacity`.
6. For each requested type with non-NULL `quantity_total`, check `occupied_type + requested_type <= quantity_total`.
7. Atomically insert Reservation and one item per requested Ticket Type. If any check fails, reject the entire request.
8. Commit. Ticket issuance and seat-config changes use a compatible lock order.

### 32.3 Capacity and per-type limit changes

For published GA events, changes to `ga_capacity` or type ceilings require an approved Event Change Request. A decrease cannot fall below issued occupying tickets plus effective holds (ACTIVE unexpired / PROTECTED) for the relevant shared or per-type inventory. Event and inventory locks must prevent concurrent overbooking.

------------------------------------------------------------------------

# Part VIII --- Orders and Order Items

## 33. Order semantics --- FINAL

Order is created when the user confirms checkout after a valid
reservation exists.

Order is a permanent historical business record. It is not the temporary
inventory hold.

After Order creation, its composition and financial snapshot are
immutable. If the buyer wants different seats, quantity, or promo
configuration, the current checkout must be cancelled/released and a new
reservation/order flow started.

------------------------------------------------------------------------

## 34. `orders` --- FINAL

``` text
orders
- id                UUID PK
- order_number      VARCHAR UNIQUE NOT NULL
- event_id          UUID FK -> events NOT NULL
- buyer_user_id     UUID FK -> users NOT NULL
- reservation_id    UUID FK -> reservations UNIQUE NOT NULL

- status            PENDING | CONFIRMED | CANCELLED | EXPIRED NOT NULL

- subtotal_minor    BIGINT NOT NULL
- discount_minor    BIGINT NOT NULL DEFAULT 0
- total_minor       BIGINT NOT NULL

- promo_code_id     UUID FK -> promo_codes NULL

- created_at        TIMESTAMPTZ NOT NULL
- confirmed_at      TIMESTAMPTZ NULL
- cancelled_at      TIMESTAMPTZ NULL
- expired_at        TIMESTAMPTZ NULL
```

Money invariants:

``` text
subtotal_minor >= 0
discount_minor >= 0
total_minor >= 0
discount_minor <= subtotal_minor
total_minor = subtotal_minor - discount_minor
```

Future explicit platform/payment fees may extend this formula.

`CONFIRMED` is intentionally payment-neutral: a free order can be
confirmed without ever being "paid". Payment state belongs to
`payments`.

One reservation may create at most one order (`reservation_id UNIQUE`).

------------------------------------------------------------------------

## 35. `order_items` --- FINAL

``` text
order_items
- id                 UUID PK
- order_id           UUID FK -> orders NOT NULL
- ticket_type_id     UUID FK -> ticket_types NOT NULL
- event_seat_id      UUID FK -> event_seats NULL

- ticket_type_name   TEXT NOT NULL
- unit_price_minor   BIGINT NOT NULL
- quantity           INTEGER NOT NULL

- created_at         TIMESTAMPTZ NOT NULL
```

`ticket_type_name` and `unit_price_minor` are historical snapshots.
Later Organizer price/name changes must not rewrite old orders.

### General Admission order item

One row may represent multiple tickets:

``` text
event_seat_id = NULL
quantity >= 1
```

### Assigned Seating order item

One row represents one concrete seat:

``` text
event_seat_id IS NOT NULL
quantity = 1
```

This makes later ticket issuance, seat tracking, attendee assignment,
and partial refund behavior straightforward.

All totals are calculated by backend. Client-provided totals are never
trusted.

------------------------------------------------------------------------

## 36. Free checkout --- FINAL

For a free reservation, confirmation requires no payment record.

Atomically:

``` text
BEGIN
  revalidate reservation/inventory
  create order + order items
  order -> CONFIRMED
  reservation -> CONVERTED
  create tickets
COMMIT
```

Ticket schema is pending, but issuance occurs only after successful
confirmation.

------------------------------------------------------------------------

## 37. Paid checkout --- FINAL boundary

> **[CHANGED v0.2]** Order creation and Payment creation are separate operations; the latter occurs only when the buyer starts payment.

For paid checkout:

1.  Revalidate reservation/inventory.
2.  Revalidate promo if supplied.
3.  Freeze backend-calculated subtotal/discount/total in Order.
4.  Create `Order(PENDING)` and immutable `order_items`.
5.  Create any required `promo_hold`.
6.  Commit Order and any promo hold; **Payment is not created until the buyer explicitly starts payment**.
7.  On Pay, revalidate Order/Reservation/paid-sales permission and create `Payment(PENDING)` in a separate short transaction.
8.  Perform asynchronous provider/sandbox payment flow.
9.  Process provider result/webhook idempotently under the DMS rules in Part XVIII.

A failed payment attempt does not necessarily expire the Order if the
inventory reservation is still valid. The buyer may make another payment
attempt while the reservation remains active.

One Order may therefore have multiple Payments:

``` text
Order
  Payment #1 FAILED
  Payment #2 FAILED
  Payment #3 SUCCEEDED
```

After reservation expiry, an unconfirmed Order becomes `EXPIRED`,
inventory is released, and any active promo hold is released.

The approved payment and webhook **business rules** are recorded in Parts XVIII–XX; bank-dependent API details and any not-fully-enumerated physical columns remain provisional.

------------------------------------------------------------------------

# Part IX --- Promo Codes and Async Checkout Boundary

## 38. Promo code core model --- PARTIALLY FINAL

Agreed business behavior is final; complete campaign schema remains
pending.

Promo codes require their own database entities and history.

Current conceptual `promo_codes` fields:

``` text
promo_codes
- id
- code                  case-insensitive unique
- event_id              FK -> events NULL
- ticket_type_id        FK -> ticket_types NULL
- discount_type         PERCENTAGE | FIXED_AMOUNT
- discount_value
- max_redemptions       INTEGER NULL (NULL = unlimited)
- redemption_count      INTEGER NOT NULL DEFAULT 0
- valid_from
- valid_until
- is_active
- created_at
- updated_at
```

Scope semantics:

-   `event_id = E, ticket_type_id = T` -\> applies to that ticket type
    in that event.
-   `event_id = E, ticket_type_id = NULL` -\> applies to eligible ticket
    types in that event.
-   `event_id = NULL, ticket_type_id = NULL` -\> global platform promo.
-   If `ticket_type_id` is set, it must belong to the referenced event;
    an orphan combination with `event_id = NULL` is not allowed.

Discount constraints:

-   Percentage: bounded valid percentage.
-   Fixed amount: positive integer minor units.
-   Discount cannot reduce order total below zero.

------------------------------------------------------------------------

## 39. Promo preview vs guaranteed use --- FINAL

Entering/applying a promo during checkout performs a **preview
validation only**. It does not consume or guarantee the promo.

Before starting a paid payment, backend revalidates:

-   promo exists and is active;
-   current time is within validity window;
-   event scope matches;
-   ticket-type scope matches;
-   redemption limit still has capacity;
-   order/reservation is still valid.

If the promo is exhausted at final confirmation, payment is not started
at the discounted amount. Frontend informs the user and refreshes the
total.

------------------------------------------------------------------------

## 40. Async promo hold --- FINAL architectural decision

> **[CHANGED v0.2]** Promo holds survive retryable failed AUTH attempts and remain effective while bank resolution protects the checkout.

Because paid payment is asynchronous, a discount must be guaranteed
after BiletFlow starts a payment for a specific discounted amount.

Therefore a temporary promo slot is held for the pending order.

Conceptual table:

``` text
promo_holds
- id
- promo_code_id
- order_id          UNIQUE
- expires_at
- released_at       NULL
- consumed_at       NULL
- created_at
```

No explicit status is required if derived from timestamps:

``` text
consumed_at != NULL -> CONSUMED
released_at != NULL -> RELEASED
expires_at <= current database time AND no unresolved bank operation requires protecting the hold -> EXPIRED
otherwise            -> ACTIVE
```

Available limited promo capacity is conceptually:

``` text
max_redemptions
- successful redemption_count
- effective promo_holds (unexpired active holds **plus holds protected by unresolved bank operations**, counted once)
```

Creation of the hold must be concurrency-safe by locking/atomically
checking the relevant promo row.

### 40.1 Success

On successful payment webhook, in one short transaction:

-   payment -\> SUCCEEDED;
-   order -\> CONFIRMED;
-   reservation -\> CONVERTED;
-   promo hold -\> consumed;
-   insert `promo_redemptions`;
-   increment successful redemption counter;
-   issue tickets.

### 40.2 Failure/expiry

A failed individual AUTH attempt does **not** release the promo hold while the Order and Reservation remain valid and retryable. Final Order cancellation/expiry releases the hold; successful payment consumes it. No `promo_redemption` is
created and successful redemption count does not increase.

------------------------------------------------------------------------

## 41. `promo_redemptions` --- FINAL concept

Successful use history is immutable:

``` text
promo_redemptions
- id
- promo_code_id
- order_id           UNIQUE
- discount_minor
- redeemed_at
```

`redemption_count` is useful for atomic/cached successful usage
tracking, while `promo_redemptions` is the audit/history source showing
which orders actually used the promo.

Repeated provider callbacks must never create duplicate redemptions;
approved webhook/payment idempotency rules in Parts XVIII–XIX govern this
block.

------------------------------------------------------------------------

# Part X --- Paid Sales Activation

## 42. Paid Sales Activation --- FINAL business rules, schema pending

All events begin capable of distributing free tickets without paying an
activation fee.

To sell at least one paid ticket for a specific event, Organizer must
explicitly start Paid Sales Activation and complete the required
verification/fee process.

Agreed rules:

-   activation is per event;
-   activation fee is one-time for that event, not per ticket and not a
    sales percentage;
-   free tickets do not require activation;
-   paid ticket types may be prepared before activation, but paid event
    publication/sales are blocked until activation is `ACTIVE`;
-   an event initially intended as free may later start activation;
-   Platform Admin can suspend paid sales (`SUSPENDED`);
-   every paid checkout re-checks that paid sales remain active.

Preliminary lifecycle concepts discussed:

``` text
NOT_REQUESTED
PENDING_VERIFICATION
FEE_PENDING
ACTIVE
SUSPENDED
```

Exact verification, payout-account, fee-payment tables, rejection
behavior, and reactivation rules are **OPEN** and must be finalized
before implementation.

------------------------------------------------------------------------

# Part XI --- Cancellation and Historical Visibility

## 43. Ticket issuance is the threshold --- FINAL

Rules that depend on whether users have committed to an event use
**issued tickets**, not paid sales, as the threshold.

Reason: a free event with 500 issued tickets has obligations to
attendees just like a paid event.

Therefore:

-   zero issued tickets -\> Organizer may unpublish
    `PUBLISHED -> DRAFT`;
-   one or more issued tickets -\> unpublish to Draft is prohibited;
-   cancellation workflow is required to stop the event.

## 44. Cancellation after tickets --- FINAL business direction, schema pending

If tickets exist, cancellation requires Platform Admin review. Paid
purchases should be refunded; free tickets should be cancelled; affected
users should be notified; the event remains available in relevant
histories with `CANCELLED` status.

Detailed `event_cancellation_requests`, refund tables, refund states,
and notification orchestration are not yet finalized.

------------------------------------------------------------------------

# Part XII --- Private Events and Event Admin Invitations

## 45. Private events --- FINAL semantics, schema pending

`PRIVATE` means invite-only. Private events do not appear in public
discovery.

Detailed invitation storage and acceptance flow are pending. The schema
should later support secure invitations without changing the existing
`events.visibility` model.

## 46. Event Admin invitation --- FINAL business concept, schema pending

Organizer assigns Event Admins using the user's public BiletFlow ID, not
internal UUID and not by exposing/searching private email addresses.

Agreed behavior:

1.  Organizer enters a user's `public_id`.
2.  Backend creates an invitation for that event.
3.  Invite is surfaced both by email and an in-app Inbox.
4.  Email and Inbox refer to the **same invitation record**.
5.  Invitation expires after a configured period.
6.  Accepting through one channel makes the other channel reflect the
    accepted state.
7.  On acceptance, the user receives `EVENT_ADMIN` role for that event.
8.  Organizer may later revoke the role.

Detailed invitation table/statuses are pending.

------------------------------------------------------------------------

# Part XIII --- Audit and Check-in Direction

## 47. Audit requirement --- FINAL direction

Sensitive administrative and operational actions must preserve actor,
time, target, and action details. This includes at least:

-   event application review;
-   event change approval/rejection;
-   role assignment/revocation;
-   check-in/reversal;
-   cancellation/refund decisions;
-   paid-sales activation/suspension;
-   other Platform Admin moderation actions.

Detailed generic `audit_log` schema is pending.

## 48. Attendee ticket vs Staff Pass --- FINAL distinction

Attendee ticket is one-use admission inventory. Staff Pass is reusable
staff admission.

Attendee ticket should later support states such as
valid/checked-in/cancelled/refunded. Successful first check-in prevents
duplicate admission unless an authorized reversal occurs.

Staff Pass remains active through repeated scans until revoked or
outside its validity period. Every scan is logged.

Detailed ticket, attendee, QR, check-in, reversal, Staff Pass, and
scan-record schemas are pending.

------------------------------------------------------------------------

# Part XIV --- State and Invariant Summary

## 49. State machines

### 49.1 Event Application

``` text
DRAFT -> PENDING -> APPROVED
                 -> REJECTED
                 -> WITHDRAWN
```

### 49.2 Event

``` text
DRAFT -> PUBLISHED -> COMPLETED
                  -> CANCELLED

PUBLISHED -> DRAFT only when zero tickets have been issued
```

### 49.3 Event Change Request

``` text
DRAFT -> PENDING -> APPROVED
                 -> REJECTED
                 -> WITHDRAWN
```

### 49.4 Reservation

Stored:

``` text
ACTIVE | PROTECTED | CONVERTED | RELEASED
```

Computed:

``` text
EXPIRED = ACTIVE and expires_at <= current database time; PROTECTED does not expire by original TTL
```

### 49.5 Order

``` text
PENDING -> CONFIRMED
        -> CANCELLED
        -> EXPIRED
```

### 49.6 Ticket sales manual state

``` text
ACTIVE | PAUSED
```

`NOT_STARTED`, `ON_SALE`, `ENDED`, `SOLD_OUT` are computed.

------------------------------------------------------------------------

## 50. Critical invariants checklist

Backend implementation must preserve all of the following:

1.  `users` contains only email-verified accounts.
2.  No access/refresh credentials are issued before email verification.
3.  Verification/reset/refresh secrets are stored only as hashes.
4.  Refresh sessions are independent per login; refresh tokens rotate.
5.  Password change/reset revokes all refresh sessions.
6.  Public registration can never create Platform Admin.
7.  Organizer/Event Admin are event-scoped roles.
8.  One event has one responsible Organizer in v0.1.
9.  Platform Admin cannot approve their own Event Application.
10. Application is freely editable only while Draft; Pending is
    immutable.
11. Approved application creates event + Organizer role atomically.
12. One approved application creates at most one event.
13. Moderated event fields cannot be directly edited by Organizer.
14. Only one pending Event Change Request per event.
15. Event Change Request is applied all-or-nothing by Platform Admin
    approval.
16. Visibility is Organizer-controlled and independent of lifecycle
    status.
17. Event with any paid ticket type cannot publish unless Paid Sales
    Activation is Active.
18. Paid checkout always re-checks activation because it may be
    Suspended.
19. General Admission permits multiple Ticket Types sharing `events.ga_capacity`.
20. Assigned Seating configured ticket quantities derive from enabled seats assigned to each type.
21. Assigned Seating configured capacity counts enabled seats with a Ticket Type assignment; sale availability also checks type activity and occupancy.
22. General Admission shared capacity is `events.ga_capacity`; `ticket_types.quantity_total` is an optional per-type cap.
23. Effective capacity must not exceed venue maximum capacity.
24. Physical seat price is never stored on `venue_seats`; event ticket
    type defines price.
25. Before publishing Assigned Seating, at least one enabled seat has an assigned type; unassigned seats are unsellable.
26. Inventory reservations are concurrency-safe and transactional.
27. Reservation begins only after explicit user confirmation of
    quantity/seats.
28. One reservation creates at most one order.
29. Order composition and financial snapshot are immutable after
    creation.
30. Backend calculates all prices/totals; frontend totals are untrusted.
31. Free order confirmation creates no payment record.
32. Paid order may have multiple payment attempts.
33. Promo preview does not guarantee use.
34. Async paid checkout temporarily holds a limited promo slot before
    provider payment.
35. Promo redemption is recorded on successful Order confirmation (including zero-total Free Checkout), and never duplicated.
36. Provider/webhook retries must not duplicate tickets or promo
    redemption.
37. After at least one ticket is issued, event cannot be unpublished to
    Draft.
38. Assigned-seat Venue/Layout cannot be changed through normal change
    request after tickets are issued; cancellation + new application is
    required.
39. Published/cancelled/completed historical business records are not
    normally hard-deleted.
40. Object binaries live in S3/MinIO-compatible storage; PostgreSQL
    stores keys/metadata.

------------------------------------------------------------------------

# Part XV --- Explicitly Open / Not Yet Designed

## 51. Remaining architecture blocks

The following areas are **not final in this version** and backend
developers must not invent a conflicting schema without team review:

1.  `payments` business rules and FSM are specified in Part XVIII; remaining exact provider/API-dependent fields and final integrated production migration require verification.
2.  Payment provider/sandbox request lifecycle.
3.  `payment_webhook_events` business rules and minimal state model are specified in Part XIX; final provider mapping and production migration require verification.
4.  Final Paid Sales Activation tables, identity verification, payout
    account, activation-fee payment, rejection/reactivation.
5.  `tickets` final schema and QR payload/signature strategy.
6.  `attendees` final schema and attendee-data assignment.
7.  Ticket PDF generation/storage metadata.
8.  Check-in records, reversal rules, scanner synchronization.
9.  Staff Pass final table and scan history.
10. Event Admin invitation table/statuses and inbox/email token design.
11. Private-event invitation table/statuses.
12. Event cancellation request table and complete state machine.
13. Refund/refund-item tables and async refund handling.
14. Full promotional campaign model, campaign QR/attribution, analytics
    tables if needed.
15. Notifications schema/delivery status.
16. Support cases/messages.
17. Generic audit-log schema.
18. Analytics/query/index strategy.
19. New Venue request/moderation flow.
20. Additional venue layouts/fan zones/custom layout editor (out of MVP
    unless scope changes).

------------------------------------------------------------------------

# Part XVI --- Recommended Implementation Order

## 52. Backend implementation sequence

To minimize rework, implement/finalize in this order:

1.  Identity/authentication tables and services.
2.  Roles and event-role authorization helpers.
3.  Categories, venues, predefined layout, sections/rows/seats.
4.  Event Applications + approval transaction.
5.  Events + categories/images + publish readiness.
6.  Event Change Requests.
7.  Ticket types + event seats.
8.  Reservations + concurrency locking.
9.  Orders + order items.
10. Payments + webhook idempotency.
11. Tickets + attendee/QR/PDF.
12. Check-in + Staff Passes.
13. Paid Sales Activation final implementation.
14. Event Admin/private invitations.
15. Cancellation + refunds.
16. Promotions/campaigns final implementation.
17. Notifications/support/audit.
18. Full SRS requirement-by-requirement traceability review.
19. Final PostgreSQL DDL, indexes, constraints, migrations, and ERD
    review.

------------------------------------------------------------------------

# Part XVII --- Versioning and Change Control

## 53. Updating this Source of Truth

The repository copy of this Markdown file is the editable master.

Recommended path:

``` text
docs/architecture/database.md
```

When the team approves a new architectural decision:

1.  update this file;
2.  increment the document version when the change is meaningful;
3.  commit/merge the change through normal Git review;
4.  implementation follows the newly approved document.

Git history preserves previous versions. DOCX/PDF copies may be exported
for submission or presentation, but they are not independently edited
masters.

Suggested version progression:

``` text
v0.1  current covered architecture
v0.2  payments/webhooks business architecture; Tickets + check-in remain pending
v0.3  activation + cancellation/refunds + invitations/promotions
v1.0  complete reviewed schema aligned with SRS
```

------------------------------------------------------------------------

## 54. Current architecture checkpoint

> **[CLARIFIED v0.2]** Checkpoint updated for payment/webhook scope; Tickets and Check-in remain pending.

The v0.1 checkpoint established the foundation through the paid-checkout boundary; v0.2 adds the approved payment/webhook rules in Parts XVIII–XX:

``` text
Verified User
  -> Event Application
  -> Platform Admin Approval
  -> Event Draft
  -> Organizer Configuration
  -> Publish
  -> Ticket/Seat Selection
  -> Reservation
  -> Order
  -> Async Payment Boundary
  -> [Tickets: next finalized block]
```

This document should be consulted before backend implementation or
database migration work in any covered domain.


------------------------------------------------------------------------

# Part XVIII --- Payments, Halyk DMS and Reconciliation (v0.2 addendum)

## 55. Payment attempt — APPROVED business model

> **[NEW v0.2 | APPROVED]**

- Paid `Order` may have **zero** Payments until Pay is pressed, and multiple **historical** attempts; never more than one unfinished attempt at a time.
- Payment belongs to exactly one Order (`order_id UUID NOT NULL FK`). Do not duplicate `event_id`/`reservation_id` on Payment solely for lookup; follow the Order relation.
- A retry of the *same* payment creation operation returns the existing attempt or its current state, never a new attempt. A new attempt is permitted only after prior attempt is conclusively terminal and Order/Reservation still allow retry.
- Immutable Order amounts and composition remain authoritative. Payment amount is taken from the frozen Order, not recalculated from current ticket prices.
- `provider_invoice_id` is the unique invoice/correlation reference used for bank status lookup; `provider_payment_id` may be NULL until known. Provider-specific mapping must be validated in Halyk integration.
- Payment `status`: `PENDING | AUTHORIZED | CAPTURING | SUCCEEDED | FAILED | CANCELLED`.
- `pending_operation`: `NULL | CAPTURE | CANCEL`; `cancellation_reason`: `NULL | USER_REQUESTED | RESERVATION_EXPIRED | CAPTURE_FAILED` for the approved cases below.
- No Payment record for FREE checkout.

## 56. Approved payment state combinations — FSM snapshot

> **[NEW v0.2 | APPROVED]**

The following is the **approved state-combination matrix**, not a complete substitute for transition validation. Values are `(status, pending_operation, cancellation_reason)`:

| status | pending_operation | cancellation_reason |
|---|---|---|
| PENDING | NULL | NULL |
| PENDING | NULL | USER_REQUESTED |
| PENDING | NULL | RESERVATION_EXPIRED |
| AUTHORIZED | NULL | NULL |
| AUTHORIZED | CANCEL | USER_REQUESTED |
| AUTHORIZED | CANCEL | RESERVATION_EXPIRED |
| AUTHORIZED | CANCEL | CAPTURE_FAILED |
| CAPTURING | CAPTURE | NULL |
| FAILED | NULL | NULL |
| FAILED | NULL | CAPTURE_FAILED |
| CANCELLED | NULL | USER_REQUESTED |
| CANCELLED | NULL | RESERVATION_EXPIRED |
| SUCCEEDED | NULL | NULL |

`AUTHORIZED + CAPTURE` and `CAPTURING + CANCEL` are **INVALID**. A confirmed CAPTURE refusal followed by pending bank CANCEL is `AUTHORIZED / CANCEL / CAPTURE_FAILED`; after confirmed CANCEL it is `FAILED / NULL / CAPTURE_FAILED`. Unknown CAPTURE outcome stays `CAPTURING / CAPTURE / NULL` pending reconciliation. No terminal state may retain a pending bank operation. The backend must independently enforce valid *transitions* (e.g., no `SUCCEEDED -> PENDING`), which a row CHECK alone cannot enforce.

**Implementation requirement:** use a PostgreSQL CHECK whose complete expression is explicitly `IS TRUE` (or equivalent NULL-safe logic) and enforce `status NOT NULL` plus bounded enum values. A partial unique index on `payments(order_id)` applies to `status IN ('PENDING','AUTHORIZED','CAPTURING')`. A normal unique constraint on `order_id` is incorrect because historical retries are allowed.

## 57. Payment, Order, Reservation and cancellation — APPROVED

> **[NEW v0.2 | APPROVED]**

- Reservation becomes `PROTECTED` only when AUTH is confirmed **and** the Reservation remains `ACTIVE` and unexpired at the atomic decision point. The original `expires_at` does not automatically release `PROTECTED` inventory.
- The transition `ACTIVE -> PROTECTED` must validate the **current PostgreSQL clock after acquiring required locks**, using `clock_timestamp()` or equivalent current-time predicate. `now()` / `transaction_timestamp()` is not suitable as the only deadline check after lock waits.
- Record the decision to CAPTURE atomically as `CAPTURING / CAPTURE` **before** making the external request. If cancellation wins the serialized decision, CAPTURE is prohibited. Never hold a DB transaction open across an Halyk HTTP request.
- User cancellation while AUTH is still unknown may close the Order and release an unprotected Reservation/promo hold, but Payment remains unfinished until bank result is established. A late AUTH must lead to CANCEL, never CAPTURE or restoration of released inventory.
- Cancellation after timely AUTH and before CAPTURE requires safe bank CANCEL confirmation before releasing a `PROTECTED` Reservation. If CAPTURE was already initiated, the ordinary user cancellation cannot overtake it.
- Definitively failed AUTH may permit a fresh Payment attempt for the **same valid Order**; a definitively failed CAPTURE followed by confirmed bank CANCEL ends the checkout (`Order CANCELLED`, `Reservation RELEASED`) and requires a **new Order** for another purchase.
- If CAPTURE outcome is unknown, do not treat timeout as rejection, do not free protected inventory and do not blindly repeat CAPTURE.
- Order expiration must check actual Reservation time even if a background process has not yet updated stored `Order.status`.
- Final Order/Reservation/promo-hold changes are transactional and idempotent. A late bank `CHARGE` contradicting an already cancelled Order is a **financial incident**, not permission to issue tickets; persist evidence and verify independently, with settlement/refund process deferred.

## 58. Reconciliation — APPROVED core, provider recovery PROVISIONAL

> **[NEW v0.2 | APPROVED core / PROVISIONAL Halyk guarantees]**

- Every unfinished Payment (`PENDING`, `AUTHORIZED`, `CAPTURING`) must have `next_check_at TIMESTAMPTZ NOT NULL`; terminal Payment (`FAILED`, `CANCELLED`, `SUCCEEDED`) must have `next_check_at NULL`.
- `check_failure_count INTEGER NOT NULL DEFAULT 0 CHECK (check_failure_count >= 0)` counts consecutive failed Status API checks, not legitimate bank declines; reset after a successful status lookup.
- Reconciliation selects due unfinished attempts, preferably using a partial index on `next_check_at` for unfinished statuses. Webhook and reconciliation must converge on the same idempotent Payment Service and serialize updates to the same Payment.
- For an unknown CAPTURE/CANCEL result, query Halyk Status API by supported provider correlation reference before any retry. A returned AUTH alone does not prove CAPTURE was never sent.
- The safe reissue/recovery guarantees of Halyk CAPTURE/CANCEL and exact status/error mapping are **PROVISIONAL**, pending official provider documentation and sandbox tests. Never assume idempotent financial calls without evidence.
- No extra `last_error_code` / `last_error_message` fields are required for the approved MVP FSM; technical diagnostic logging is implementation responsibility, with sensitive data redacted.

## 59. Inventory, paid-sales activation and promo coordination — APPROVED

> **[NEW v0.2 | APPROVED]** Consolidates changed rules from earlier sections.

- Availability for Assigned Seating and General Admission subtracts issued inventory, non-expired `ACTIVE` holds, and **all `PROTECTED` holds**; capacity reductions cannot cut below this total.
- New Order creation and creation of a new Payment each check relevant ticket sales window/permission; for ordinary paid-sales suspension, **creation of Payment is the final permission boundary**. An attempt already created may safely finish. Emergency stop and event cancellation are separate, pending architecture blocks.
- Race between suspension and Payment creation must be serialized so that whichever decision commits first controls acceptance.
- Promo Hold belongs to Order, not an individual Payment attempt; preserve it across definitively failed AUTH attempts while Order remains retryable. Consume once on successful checkout or release on final cancellation/expiry, with Promo Redemption and redemption counter updated atomically.
- Ticket issuance after confirmed CHARGE is idempotent; detailed Ticket uniqueness and refund constraints are deferred to the Ticket/Refund modules.

------------------------------------------------------------------------

# Part XIX --- Payment webhook journal (v0.2 addendum)

## 60. `payment_webhook_events` — APPROVED conceptual model

> **[NEW v0.2 | APPROVED conceptual / PROVISIONAL provider mapping]**

Minimal agreed logical fields (physical naming/provider mapping still to be reviewed with integration):

```text
id                  UUID PK
payment_id          UUID FK -> payments NULL
provider_invoice_id nullable correlation identifier
payload             JSONB (sanitized, never secrets/card data)
verification_status PENDING | VALID | INVALID
processing_status   PENDING | PROCESSED | IGNORED | REJECTED
received_at         TIMESTAMPTZ
processed_at        TIMESTAMPTZ NULL
```

Approved status pairs:

| verification_status | processing_status | Meaning |
|---|---|---|
| PENDING | PENDING | Received, not yet verified |
| VALID | PENDING | Verified, not yet applied |
| VALID | PROCESSED | Bank result independently confirmed and applied |
| VALID | IGNORED | Duplicate or irrelevant notification |
| INVALID | REJECTED | Authenticity check failed; no trusted financial action |

- A webhook can be logged even if no Payment matches (`payment_id NULL`). Multiple notifications per Payment are allowed; the journal is not itself the financial source of truth.
- Reject untrusted financial effects, preserve sanitized evidence, and verify bank state through the trusted Status API where required.
- Repeated or out-of-order notifications cannot reapply financial success, promo redemption, or ticket issuance.
- Reconciliation is responsible for recovery; a separate webhook `FAILED` processing status was **not** added to the approved minimal model.
- PostgreSQL status-pair CHECK must be NULL-safe and tested. A successful database CHECK does not prove correct signature validation or bank API behavior.

------------------------------------------------------------------------

# Part XX --- Financial reporting, validation and remaining dependencies (v0.2 addendum)

## 61. Processing fees — APPROVED MVP estimate

> **[NEW v0.2 | APPROVED estimate / PROVISIONAL actual bank fees]**

- Bank processing fee is borne by **Organizer**, not added to the buyer's ticket price.
- A reusable backend function calculates an **estimated** fee from a configurable rate. Do not hardcode a percentage in the business function; no actual Halyk tariff has been approved.
- Add one new historical snapshot field to Payment: `processing_fee_minor BIGINT NULL` (estimated, non-negative; `NULL` until calculated, `0` for no fee). Require non-negative values via database CHECK; compute once on confirmed successful payment, not on every analytics render.
- Existing Payment amount remains the gross payment amount; estimated Organizer proceeds = gross successful Payments minus estimated processing fees, subject to later refunds and other approved accounting adjustments.
- Analytics API aggregates authoritative stored values; frontend displays results and does not independently compute fee accounting. The estimate must not be presented as a verified actual bank deduction or real-money payout.
- Actual bank fees, payout routing and settlement behavior remain dependent on the bank contract. SRS academic MVP does not require production organizer payouts.

## 62. Verification evidence and limitations

> **[NEW v0.2 | CLARIFIED test evidence]**

- SQL constraint tests were executed by the project owner in an isolated Supabase PostgreSQL project; reported PASS for Payment FSM/null handling, provider identifier/FK checks, partial unique behavior, and webhook state pairs. These are **constraint-level tests on test structures**, not an executed end-to-end production migration.
- A `23505` unique-violation was observed when attempting a second unfinished Payment for the same Order. This confirms uniqueness enforcement; concurrent blocking/serialization across two sessions was **not independently demonstrated**.
- Webhook test reported PASS for 30 state combinations, NULL handling, and nullable Payment link. Bank signature verification and webhook delivery were not integration-tested.
- Production DDL, exact provider response mapping, transactional concurrency under load, complete Ticket/Refund issuance and reversal, and Halyk recovery guarantees remain to be verified during implementation.

## 63. Deferred domains (not silently FINAL)

> **[NEW v0.2 | DEFERRED]**

Tickets/attendees/QR/PDF, check-in, Refunds, financial incident resolution, activation workflow tables, campaign QR attribution, notifications, support, full audit history, full analytics and deployment/non-functional tests remain future modules as already noted in §51. SRS compatibility review found no direct contradiction in the covered checkout/payment design; it does **not** establish full requirement-by-requirement traceability for the entire MVP.


---

# Part B — v0.3 proposed consolidated amendments and new domain contracts

> **Supersession register:** The following provisions replace inconsistent v0.2 passages after v0.3 approval. In particular: old `§18` editable/moderated field split; old `§19.2 UNIQUE(change_request_id,field)`; old image moderation workflow `§20` for post-publication edits; old `§51` assertions that downstream Tickets/Refunds remain wholly undesigned; and any old assumption that GA has exactly one ticket type. All unrelated v0.2 requirements remain in force. Existing provider caveats are not overridden.

## B1. Business invariants and event lifecycle — APPROVED

- Event status remains `DRAFT | PUBLISHED | COMPLETED | CANCELLED`; `CANCELLED` is terminal. A cancelled event cannot be republished; create a new Draft/Event ID instead. Historical orders, payments, tickets, refunds and audit records remain associated with the old event.
- If no ticket has **ever** been issued, Organizer may choose `PUBLISHED -> DRAFT` or direct cancellation without an administrative cancellation request. After any ticket issuance (including free), Draft return is forbidden and cancellation requires Platform Admin review. Do not infer historical issuance from current `VALID` tickets only; retain historical rows.
- `events.cancelled_at` already exists in v0.2; populate once upon actual cancellation. Do not add a duplicate field.
- On cancellation, atomically change Event state and persist review/audit plus durable recovery intent; after commit, an idempotent background processor handles reservations, payments, tickets, free registrations, notifications and Refund Service calls in bounded batches. Event `CANCELLED` must immediately deny new reservations, issuance, sales and check-in, even before individual tickets are updated.
- In-flight payment authorization/capture is not part of the PostgreSQL transaction. Follow v0.2 AUTH/CAPTURE/CANCEL, expiry, webhook and reconciliation rules. Successful money capture after cancellation without ticket issuance creates a refund obligation; no ticket is issued. Missing issued tickets **do not prove** there are no paid financial obligations.
- For cancellation before event start, eligible paid orders use `AUTOMATIC_FULL`. For cancellation after start, normally `ADMIN_REVIEW`; where Platform Admin confirms no service was delivered, `AUTOMATIC_FULL` may be chosen. Absence of check-ins alone does not prove nonperformance. Existing successful check-ins remain in history. Applicable law may require refunds beyond this product-level classification.

## B2. Event cancellation request — APPROVED conceptual contract

`event_cancellation_requests` (new domain table):

| Field | Type / invariant |
|---|---|
| `id` | UUID PK |
| `event_id` | UUID NOT NULL FK to events |
| `requested_by_user_id` | UUID NOT NULL FK to users |
| `status` | `PENDING | APPROVED | REJECTED | WITHDRAWN` |
| `reason` | TEXT NOT NULL, trim nonempty, immutable after submission |
| `refund_handling_mode` | nullable `AUTOMATIC_FULL | ADMIN_REVIEW`; nonnull **iff** `status=APPROVED` |
| `reviewed_by_user_id`, `reviewed_at`, `review_comment` | review metadata; reject reason required; system/no-admin paths represented explicitly in audit |
| `created_at`, `updated_at` | TIMESTAMPTZ NOT NULL |

- No `DRAFT` for cancellation requests. One `PENDING` cancellation request per Event, enforced with a partial UNIQUE index. Organizer may withdraw before a decision; approval and withdrawal are mutually exclusive via Event-then-request locks and status rechecks. `APPROVED` request and Event `CANCELLED` commit atomically. Repeat approval is idempotent.
- Cancellation request may coexist with pending Event Change Request. Successful cancellation rejects pending change request with machine-readable `EVENT_CANCELLED` reason, atomically. Unsubmitted change drafts remain viewable and organizer-deletable, not submit-able; submitted requests remain in history.
- Self-cancellation when no tickets have ever been issued uses no artificial cancellation request, but still writes audit and durable recovery intent.
- Backend must check each required SQL UPDATE row count and roll back on failure; row-state CHECK alone does not enforce FSM or atomic cross-table consistency.

## B3. Event change requests — APPROVED

- Retain `event_change_requests` statuses `DRAFT | PENDING | APPROVED | REJECTED | WITHDRAWN`; organizer can edit/delete drafts and withdraw pending requests, not approved changes. Only one pending change request per Event. Admin does not alter submitted proposed values; whole package approved/rejected atomically. Admin rejection requires reason; no automatic timeout decision.
- Keep `event_change_request_items` with `old_value`/`new_value` JSONB; add `event_id UUID NOT NULL` and `target_id UUID NULL`. Event-level fields require null target; Ticket-Type-level fields require target. Constrain allowed `(field,target)` combinations. Composite FK `(change_request_id,event_id)` -> change requests `(id,event_id)`; composite FK `(target_id,event_id)` -> ticket types `(id,event_id)` where target present; referenced pairs must be unique. Backend verifies object kind and ownership for all target types.
- Replace `UNIQUE(change_request_id,field)` with partial unique `(change_request_id,field) WHERE target_id IS NULL` and `(change_request_id,field,target_id) WHERE target_id IS NOT NULL`. Multiple ticket types and different fields of same type can be changed in one request; duplicate field+target cannot.
- Pending items immutable. On approval: lock Event first, then request and relevant inventory/target rows in a documented consistent order; recheck rights, Event state, FSM, item values, capacity and dependencies; apply **only** requested fields, atomically with request approval, version increment (if applicable), durable audit and notification intent. Failure of any item rolls back all. No extra `base_purchase_terms_version` required; unrelated organizer-edited fields must not be overwritten. Duplicate approval must not repeat updates, version increment or notifications.
- For cancellation or completion while a change request is pending, disallow further approval. On cancellation pending requests are system-rejected with `EVENT_CANCELLED`; drafts remain viewable/deletable.

## B4. Editable/moderated fields — CHANGED from v0.2 §18

| Area | Organizer direct edit | Event Change Request / admin approval | Immutable / exception |
|---|---|---|---|
| Title | In Event Application Draft | Any title change of published Event | Historical title in audit |
| Description, categories, images | Yes after publication; log changes | No routine request | Content complaints via Support; Admin moderation |
| Public contact name/email/phone, Instagram, Telegram, website | Yes | No routine request | Backend validates safe links/format |
| Responsible name/email/phone | No | Yes | Responsible person need not be a BiletFlow user; no user FK or new consent required |
| Start/end time, actual Venue | No | Yes | Assigned Seating Venue replacement after ticket issuance forbidden |
| Refund policy | Editable before first successful sale, with audit | After first successful sale | Prior orders retain snapshot |
| Ticket prices, GA capacity, ticket-type limits, sales windows, ticket-type disable/enable | Not for published Event | Yes | Past Orders and Tickets unchanged |
| Seating mode | Only Event Application Draft | No after application approval | Immutable once Event Application approved |
| Assigned Venue Layout | Before issuance via request | Yes before first issuance | Forbidden after first issuance |
| Assigned seat enable/disable and ticket-type assignment | Direct until first issuance, absent conflicting ACTIVE/PROTECTED holds | No routine request | After first issuance Organizer forbidden; Platform Admin exceptional audited action |
| Visibility, public operations, invitations/staff/promo | As otherwise allowed in v0.2 | Not by default | Existing lifecycle and permissions apply |

- GA may have **multiple** ticket types sharing common capacity, with optional per-type limits. v0.2 assertions of exactly one GA ticket type are superseded. Capacity checks include issued/committed inventory plus ACTIVE/PROTECTED holds under locks; verify exact counting semantics against current reservation/inventory model.
- Ticket-type `is_active BOOLEAN` only if no equivalent existing field. Disabled types deny new Reservations but do not automatically void valid prior Reservations; re-enable via approved request. Used types must not be physically deleted; unused types may be removed subject to FK and published-event change approval.
- Price changes affect future purchases only; existing Order/Reservation amount snapshots remain. Price-only, capacity-only, ticket-type changes and sales-window changes do not increment purchase-terms version or create a special refund window.
- Images are stored in MinIO/S3 with cover `position=0` and carousel positions; organizer may edit published images without preapproval. Validate upload format, size, content handling, access rights; complaints go through Support and admin can remove violating content. No arbitrary external URL as canonical image storage. Previous change-request image review mechanism no longer applies to routine image changes.

## B5. Versioning, stale purchases and special refunds — APPROVED

- `events.purchase_terms_version INTEGER NOT NULL` starts at a positive value and increments once per approved package that changes start date/time, end time, actual Venue, refund policy, or permitted Venue Layout. End-time-only changes do **not** open special refund window. Typo/name/description/category/image/price/limit/sales-window changes do not increment version unless another explicitly listed field changes.
- Store corresponding version in Reservation and Order. Prior Order retains immutable `refund_policy_snapshot JSONB NOT NULL` validated against a strict structured policy schema; no separate policy-version table for MVP. A version number alone does not reconstruct historical refund policy.
- Stale Reservations cannot complete checkout/issue tickets; backend must check under appropriate Event/inventory locks in synchronous paths, payment callbacks and reconciliation. Use lazy invalidation plus background cleanup. Cancel/resolve in-flight banking safely; if capture succeeded on obsolete terms, refund without issuing new tickets.
- An approved material change of event start date, start time, or actual Venue creates a special **24-hour** full-order refund right for orders bought under earlier applicable terms. Window starts at atomic approval/application time `event_change_requests.reviewed_at` and is not tied to email delivery/read. Each new material change starts a separate window; no stored `special_refund_deadline` needed.
- Backend checks that Order predates the particular change (use saved version and approved change history), verifies eligibility and ticket/check-in constraints, and atomically creates a single approved Refund Request. A buyer who requests within the window retains the right after the window closes; bank reconciliation/retries continue. Email and Inbox link to authenticated order, not a bearer token granting refund authority. Normal policy and Support remain available after window expires.
- `refund_requests.event_change_request_id UUID NULL` FK to approved change request: mandatory iff `source=EVENT_CHANGED`, otherwise null. Backend verifies change request belongs to the Order Event and is materially eligible. Existing Order locks/unfinished and succeeded Refund constraints prevent duplicates. Full-order-only refunds remain.
- Important design verification before production: make sure `reviewed_at` and committed application timestamp are identical by contract; database `NOW()` in a long-running transaction may differ from actual commit time. Choose one transaction timestamp consistently and specify user-visible boundary behavior.

## B6. Refund Service — approved business architecture, production DDL review pending

- Separate `refund_requests` (authorization/decision) from `refunds` (individual provider attempts). Approved request does not equal succeeded money transfer. Sources include CUSTOMER, PLATFORM_ADMIN, EVENT_CANCELLATION, EVENT_CHANGED, and any previously approved system fast-refund source; reconcile exact enum names with R37 before migration. Customer reason codes are stable identifiers (five configured UI reasons) with optional comment and required comment for OTHER. UI display text may change independently.
- Ordinary refund: Organizer alone approves/rejects; Platform Admin is not in the normal path. Request can be withdrawn before organizer decision. After 24h pending send reminder; after 48h without decision escalate to `PENDING_ADMIN`; Organizer loses decision authority for that request, Admin decides. Escalation does not auto-approve. Track objective organizer lateness in history/admin reporting; no numeric reputation score in MVP.
- Platform Admin can initiate a full refund directly, including Support disputes, subject to all financial constraints. System fast refund: within 15 min of purchase if at least 24h before Event and other eligibility requirements. Event cancellation mandatory refunds and event-change special refunds use existing Refund Service without manual organizer approval.
- Refund Service: lock Order and related Request/Refund/Payment in globally consistent order; verify approved request, succeeded matching Payment, entire paid amount from Payment (never frontend), no succeeded or unfinished conflicting Refund, valid FSM and ticket/check-in restrictions; create new attempt and durable work before provider calls. Keep financial identity fields (`order_id`, `payment_id`, `refund_request_id`, `amount_minor`) immutable; restrict DB write privileges as needed.
- Refund attempt FSM: `PENDING -> PROCESSING -> SUCCEEDED | FAILED | UNKNOWN`; UNKNOWN may resolve only from reliable provider evidence to SUCCEEDED or FAILED. No backward transitions from SUCCEEDED. Protect success and unfinished states with appropriate partial unique indexes; composite FK verifies Payment and Refund Request belong to same Order.
- Mandatory cancellation retry: at most 5 SYSTEM attempts per refund-request chain; count from existing refund rows, exclude PLATFORM_ADMIN manual attempts; retry only when previous outcome definitely FAILED and provider policy permits it, at due `next_retry_at`, using exponential backoff. UNKNOWN requires reconciliation, not a blind new attempt. On exhaustion or persistent failure escalate to admin. Retry count and creation are atomic under Order lock. Worker crash/restart must preserve due tasks; ensure consistent Order -> Request -> Refund lock order.
- Final ticket invalidation, inventory release and financial result must follow previously approved Refunds atomicity rules. Provider-dependent status queries, safe idempotency and insufficient-funds behavior remain PROVISIONAL. An insufficient-funds provider failure must be visible to Admin, not interpreted as successful refund. No invented organizer balance/reserve; payout/settlement model with Halyk OPEN.
- Policy hierarchy: applicable law > mandatory BiletFlow rules > structured Organizer policy. Organizer may specify no additional voluntary refunds; platform/mandatory refunds and Support remain available. Policy is selected through structured application form and captured for Order. Changes after first sale require Event Change Request; new policy applies only to future Orders even if more generous. Ticket UI/PDF may show 'Подать запрос на возврат можно до ...' when a meaningful deadline exists; freshly downloaded PDF uses current display, without replacing immutable Order policy.
- Two organizer consents for each Event Application: Organizer Rules and Ticket Sales/Refund & Financial Responsibility terms; store document type/version, actor, application and acceptance time. Registration has User Agreement and privacy acceptance/acknowledgment as legally appropriate. Draft legal text deferred; do not treat checkbox as waiver of statutory rights.

## B7. Required backend ownership register — MUST NOT BE LOST

1. All application approvals and creation of Event/Organizer role in one transaction; no self-approval if v0.2 forbids it.
2. Event cancellation and Change Request approval require Event-first locking and full revalidation, including issued-ticket history and FSM transitions.
3. Issuance of the first Ticket and seat availability/type edits must serialize through common Event/inventory locks; a standalone EXISTS is insufficient.
4. Cross-table check that all target Ticket Types belong to the request Event; composite FK plus backend validation.
5. For multi-item change requests validate **all** changes before applying **any**; commit package, request status, version and transactional audit together.
6. When cancelling Event, durably record pending downstream work; worker must be restart-safe, idempotent, bounded, and recover even if process dies between commit and job dispatch.
7. For each paid Order distinguish succeeded/unfinished/UNKNOWN/FAILED/no Refund; never start duplicate banking; use Refund Service's locks and provider reconciliation.
8. Stop check-in immediately when Event is CANCELLED even if ticket status not yet updated; retain scan history.
9. Stale Reservation/version check on every checkout completion path including webhook and reconciliation; honor v0.2 AUTH time/expiry under locks.
10. Prevent double special refund and enforce 24h eligibility against the *specific* approved change and saved Order version.
11. Preserve immutable Order price, policy and ticket identity history. Do not physically delete issued tickets or financially referenced ticket types.
12. Validate all uploads and external URLs; use S3/MinIO keys, not arbitrary remote image URLs; maintain audit and Support complaint path.
13. Persist notifications reliably (email/inbox) and avoid duplicate sends on retries; bank calls only after transaction commit.
14. Audit actor, target, time, action, old/new values and reason for sensitive operations; distinguish system auto-rejection from admin rejection.
15. Backend enforces acceptance of both applicable Organizer documents on each Event Application submission, with immutable versioned acceptance evidence.
16. Backend validates structured JSONB policy snapshot and does not permit arbitrary hidden free-text terms to change algorithmic eligibility.
17. Backend handles expired or invalid pending requests and manual override paths without silently changing financial FSM or bypassing provider safety.

## B8. Evidence, acceptance gates and unresolved issues

### SQL verification actually performed (isolated test tables)

- R37/R38: request/refund uniqueness and composite FKs, status checks, rollback, 5-attempt count, retry recovery after rollback, serialized workers, SQL eligibility conditions. These do **not** prove real FastAPI/Halyk behavior.
- C57: composite FK target ownership, partial unique field/target constraints, CHECK field/target, package rollback, repeated approval and two-admin serialized approval.
- C58: one pending cancellation request, approved/refund mode CHECK, atomic Event+request update, rollback, repeat approval, approve/withdraw races both orders, simultaneous rejection of pending change request, classification of recovery actions. Production worker not tested.

### OPEN / PROVISIONAL

- Halyk actual DMS, refund status and idempotency API, callback semantics, settlement recipient, insufficient funds and payout/reserve capabilities. No claims of supported delayed settlement or organizer funds freezing.
- Exact production DDL/enum names, target field mapping for every moderated field, `event_change_request_items` foreign-key strategy for future non-Ticket-Type target objects, constraints for JSONB policy, partial uniqueness with all Refund Request sources, notification outbox and worker leasing/recovery specifics.
- Complete SRS traceability matrix and legal review for Kazakhstan before production. SRS UC5 organizer refund capability is preserved by organizer direct approval, but verify the exact refund eligibility and cancellation obligations against final legal policy.
- Potential rule tension: older v0.2 sales-window cutoff and later change semantics; audit exact existing sales window checks before migrations. `purchase_terms_version` should not be used as an inventory version for unrelated price/limit changes.
- Event cancellation when no issued ticket but a successful Payment must create a financial obligation (not simply skip refund).
- Organizer's ability to modify structured policy prior to first successful sale must still respect outstanding Reservations and version invalidation.
- Whether existing `event_seats.is_enabled` and `ticket_types.is_active` already implement the desired toggles; do not duplicate.
- Source of Truth should record that change requests may have DRAFT entries, while the one-pending constraint does not prohibit multiple DRAFTs unless separately approved.

### Release gates

1. Review this Part B against the entire Part A and embedded SRS; resolve every contradiction explicitly.
2. Validate exact enum/column/index definitions against current PostgreSQL 16 production schema, not only test tables.
3. Review global lock order and isolation level across Orders/Payments/Reservations/Tickets/Events/Refunds.
4. Build FastAPI integration tests including crash recovery, concurrent approval, bank callbacks and replay/idempotency.
5. Validate legal and banking dependencies before production paid sales.

---

# Part C — GA-01–GA-22 integration register (APPROVED, 2026-11-08)

This section records decisions not fully represented by the original v0.2 schema. In case of conflict with an unchanged legacy paragraph, the revised §§23–25, 31–32 and this register govern the v0.3 REVIEW DRAFT. This is an architecture contract, not evidence of production implementation.

## C.1 Schema and order/issuance rules

- `events.ga_capacity INTEGER NULL`: positive and required for GA, NULL for Assigned Seating; backend checks venue capacity. No new GA config table.
- `ticket_types.quantity_total INTEGER NULL`: optional positive GA per-type ceiling; for Assigned Seating quantity is derived from enabled, assigned event seats. `ticket_types.is_active BOOLEAN NOT NULL DEFAULT TRUE` is proposed unless an equivalent existing field is verified; this is separate from `sales_status ACTIVE/PAUSED`.
- Existing `reservation_items` and `order_items` support multiple GA types. A GA reservation uses one item per type; unique partial index `(reservation_id, ticket_type_id) WHERE event_seat_id IS NULL`. Backend enforces same-event relationships.
- One `order_item` with quantity N generates N separate Ticket records/QRs, each linked to the appropriate order item and type. Order confirmation, reservation conversion, and all ticket issuance are atomic.
- A single Order may mix free and paid items. `total_minor > 0` uses Paid Checkout; `total_minor = 0` uses Free Checkout without Payment, even when a valid promotion reduced a paid item to zero. The entire Order confirms or fails as one unit.
- One Order accepts at most one promo (`orders.promo_code_id`). A percentage applies to the eligible subtotal; FIXED_AMOUNT is deducted **once per Order** from eligible items, not per ticket, and cannot exceed that subtotal. Promo scope (global/Event/Ticket Type) and existing promo holds, limits, frozen totals, and bank-protection rules remain in force. For zero-total checkout, redemption is consumed atomically with confirmation without a bank Payment.
- Any Event with a PAID Ticket Type requires `Paid Sales Activation = ACTIVE` for publication, even if free types coexist or a promo could reduce an order to zero. Recheck activation at the paid Payment boundary. A published free-to-paid type change additionally requires active activation.

## C.2 Ticket Type changes and seating restrictions

- GA types may be added after publication via Event Change Request, including `CREATE_TICKET_TYPE` with a NULL target ID because the target does not yet exist. Its validated creation payload lives in `new_value`; approval creates the type atomically. Existing `(field,target_id)` CHECK/UNIQUE contracts need an explicit CREATE branch and duplicate-creation handling; the earlier test CHECK was illustrative, not production-complete.
- Published-event price changes, including FREE→PAID and PAID→FREE, use Event Change Request and affect only future purchases; existing reservations/orders keep their frozen amounts. No automatic price-difference refund, purchase-terms-version increment, or 24-hour special refund window solely for price changes.
- For Assigned Seating, before first-ever issuance, new types may be added, unused types deleted (only after all seat references are reassigned/cleared), and seats assigned/reassigned subject to effective hold checks. After first-ever issuance, Organizer may not change seat-to-type assignments or `event_seats.is_enabled`, even if tickets are later refunded. Admin exceptions are audited and cannot silently rewrite existing tickets.
- Unassigned seats are not for sale. Disabling a type via `is_active = FALSE` does not change seat assignment or `event_seats.is_enabled`; existing tickets remain valid and valid holds may complete. Published-event disable/re-enable follows Event Change Request; current availability is computed separately from configured capacity.
- Physical deletion of a type is prohibited while referenced by Orders, Tickets, or effective Reservations; FK enforcement plus backend checks are required. Configured capacity and live sellable inventory are distinct metrics.

## C.3 Backend invariants and integration requirements

- All GA reservation creation paths serialize on the Event (or an equivalent common per-event lock) and selected Ticket Types in deterministic order; they validate both shared capacity and all requested type limits in one transaction.
- Effective occupancy must not double-count a converted reservation and its issued tickets. Checked-in tickets are not automatically released; successfully refunded unused tickets no longer consume capacity, without physically deleting ticket history.
- Issuance and changes governed by the historical first-issued-ticket boundary use a shared lock order and query **any historically issued Ticket**, not only currently valid tickets.
- Promotional zero-total confirmation must consume its limited allocation exactly once and preserve the established promo-hold concurrency and immutability rules. Exact service and DDL implementation remains to be integrated and tested.
- Cross-entity invariants (`ga_capacity <= venue.max_capacity`, item/type/Event membership, price/activation state, mixed-item totals) need explicit backend validation where ordinary CHECK cannot enforce them.

## C.4 Supersession and outstanding audit

- Replaces v0.2 GA-one-type assumptions in §§23, 25, 31, 32, and checklist §50. Revises §24 to permit unassigned unsellable seats.
- Supersedes any older instruction that every enabled Assigned Seating seat must have an assigned type before publication.
- The pre-existing v0.2 promo scope, promo hold protection, payment DMS, and webhook invariants remain in force except for the expressly approved zero-total promo redemption clarification.
- Still requires full SRS cross-check, integrated production DDL, Refund/Payment/Check-in integration tests, and review of all remaining legacy-versus-v0.3 contradictions. Do not label these PASS based only on the prior isolated SQL tests.

------------------------------------------------------------------------

# Appendix S — SRS v0.3 Initial Draft (reference transcription from handoff)

# Приложение C. Полный текст SRS v0.3 Initial Draft

### SRS — страница 1

Software Requirements Specification
BiletFlow: Self-Service Event Ticketing Platform for Kazakhstan
Version: 0.3
Status: Initial Draft
Project Type: Web and mobile event and ticket management platform
Executive Summary
BiletFlow is a Kazakhstan-focused self-service platform that allows individuals, student organi-
zations, businesses, and community groups to create events and issue digital tickets.
Creating an event and distributing free tickets is free. Organizers who want to sell paid tickets
must activate paid sales for the event by paying a one-time activation fee and completing
identity and payout verification.
The platform provides event pages, ticket inventory management, online registration, se-
cure payments, QR-code tickets, calendar export, attendee management, and a mobile ticket-
verification app for event administrators.
1. Introduction
1.1 Purpose
This document defines the initial requirements for BiletFlow. It describes the platform’s users,
business model, main features, constraints, and MVP scope.
1.2 Scope
The platform will allow organizers to:
• Create and publish public or private physical events held at a venue.
• Create multiple ticket types.
• Configure assigned-seating events and interactive seat maps.
• Issue free tickets without paying a platform fee.
• Activate paid ticket sales for individual events.
• Set prices, quantities, and sale periods.
• Track registrations and revenue.
• Send digital tickets containing unique QR codes.
• Allow attendees to download and print their tickets.
1


### SRS — страница 2

• Assign event administrators who verify tickets and check attendees in through a mobile
app.
• Allow attendees to export event details to their preferred calendars.
• Cancel orders and process refunds where permitted.
Attendees will be able to discover events, register or purchase tickets, receive digital tickets,
add event details to their calendars, and present their tickets for check-in.
1.3 Definitions
• Organizer: A user who creates and manages an event.
• Attendee: A person who registers for or purchases a ticket.
• Event Admin: An organizer-authorized user who uses the mobile app to verify tickets
and check in attendees. This role is separate from the Platform Admin.
• Free Ticket: A ticket with no payment requirement.
• Paid Ticket: A ticket that requires payment during checkout.
• Paid Sales Activation: The process that enables an organizer to collect money for an
event.
• Support Case: A support request linked to a user, event, order, or ticket and represented
through an asynchronous chat-like conversation.
• Promo Code: An organizer-created code that applies a configured ticket discount and
attributes the resulting order to a campaign.
• Campaign QR Code: A promotional QR code that opens an event page through a trackable
link and automatically applies its associated promo code. It is not an admission ticket.
• Platform Admin: Internal staff responsible for moderation, disputes, and platform man-
agement.
• Payment Processor: An external service that processes payments and organizer payouts.
2. Overall Description
2.1 Product Perspective
BiletFlow will consist of:
• A responsive web application for organizers and attendees.
• A dedicated iOS and Android application for event administrators to verify tickets and
manage check-in.
• An administrative web portal.
• Backend services for events, orders, payments, tickets, support cases, promotional cam-
paigns, notifications, and reporting.
• Integrations with a payment processor, email provider, and calendar-export services.
2


### SRS — страница 3

2.2 Stakeholders
• Event organizers
• Attendees
• Event administrators and check-in staff
• Platform administrators
• Payment and payout providers
• Development and QA teams
• Project sponsors and business stakeholders
2.3 User Classes
Attendee
Can browse events, register, purchase tickets, download tickets, and review existing orders.
Organizer
Can create events, configure ticket types, activate paid sales, manage attendees, view sales, and
assign check-in staff.
Event Admin
Can use the mobile app to select assigned events, scan and verify QR-code tickets, search for
attendees, and record or reverse check-ins.
Platform Admin
Can moderate events, manage users, review payment activation requests, handle disputes, and
view platform reports.
3. Business and Monetization Model
3.1 Free Events
Organizers may:
• Create and publish events without charge.
• Create free ticket types.
• Issue QR-code tickets.
• Use attendee lists and check-in functionality.
3


### SRS — страница 4

• Send basic confirmation messages.
3.2 Paid Events
Paid ticket sales remain disabled until the organizer:
1. Creates an event and at least one paid ticket type.
2. Completes identity and payout verification.
3. Pays the event’s Paid Sales Activation Fee.
4. Connects or registers a valid payout account.
5. Accepts the paid-event terms.
Once activated, the organizer can collect ticket payments for that event.
For the academic MVP, identity checks, activation-fee payment, ticket payment, and organizer
payouts may be implemented with a provider sandbox or clearly labelled simulation. No real
money movement is required for the term demonstration.
3.3 Recommended Initial Pricing Model
• Free events: no platform fee.
• Paid Sales Activation Fee: one-time fee per event, charged in KZT; amount to be deter-
mined.
• Payment-processing charges: deducted from each transaction.
• Optional per-ticket service fee: excluded from the initial MVP and considered for a later
release.
This model gives organizers the complete basic workflow at no cost and charges them only
when they intend to generate revenue.
4. System Features and Requirements
4.1 Account Management
• Users shall be able to register using an email address.
• Users shall be able to verify their email addresses.
• Users shall be able to sign in, sign out, and reset passwords.
• Organizers shall have a profile containing contact and payout information.
• The system shall support role-based permissions.
4


### SRS — страница 5

4.2 Event Management
Organizers shall be able to:
• Create, edit, duplicate, publish, unpublish, and cancel events.
• Add an event title, description, category, images, venue, date, and time.
• Create physical, venue-based events.
• Mark events as public, unlisted, or private.
• Define registration opening and closing times.
• Set an event capacity.
• Preview an event before publication.
4.3 Ticket Management
Organizers shall be able to:
• Create free and paid ticket types.
• Set ticket name, description, price, and quantity.
• Configure ticket sales start and end times.
• Limit the number of tickets purchased in one order.
• Hide ticket types without deleting them.
• View the number of available, reserved, sold, refunded, and checked-in tickets.
The system shall prevent ticket sales when inventory has been exhausted.
4.3.1 Assigned Seating and Seat Selection
• Organizers shall be able to mark an event as general admission or assigned seating.
• The academic MVP shall provide at least one predefined venue layout containing sections,
rows, seat numbers, accessible seats, and price categories.
• Organizers shall be able to select and configure the predefined layout; a visual venue-
layout editor is not required.
• For assigned-seating events, attendees shall see an interactive seat map during registra-
tion or checkout.
• The seat map shall clearly distinguish available, selected, temporarily held, sold, unavail-
able, and accessible seats with both colors and text or symbols.
• Attendees shall be able to select one or more available seats and see the ticket price before
continuing to checkout.
• Selected seats shall be held temporarily while checkout is in progress.
• A seat hold shall expire and release the seat when checkout is abandoned or its time limit
is reached.
5


### SRS — страница 6

• The system shall prevent two orders from purchasing the same seat, including when
multiple attendees check out concurrently.
• The assigned section, row, and seat number shall be stored on the ticket and order item.
4.4 Free Registration
• An attendee shall be able to reserve a free ticket without entering payment information.
• The system shall create an order with a zero-value total.
• The attendee shall receive a confirmation email and QR-code ticket.
• The organizer shall see the registration in the attendee list.
4.5 Paid Sales Activation
• Paid tickets shall not be purchasable before activation.
• The organizer shall see an activation checklist.
• The system shall record payment of the activation fee.
• The system shall verify that the simulated or sandbox payout requirements are complete.
• Activation shall apply only to the selected event.
• Platform administrators shall be able to suspend paid sales when fraud or policy violations
are suspected.
4.6 Checkout and Payments
• Attendees shall be able to select tickets and provide attendee details.
• Ticket inventory shall be temporarily reserved during checkout.
• The system shall calculate ticket totals and processing charges.
• Payments shall be processed through an external provider sandbox or a clearly labelled
internal simulation for the academic MVP.
• Tickets shall only be issued after successful payment confirmation.
• Failed or abandoned transactions shall not create valid tickets.
• Organizers shall be able to view gross sales, fees, refunds, and estimated payouts.
• Demonstration payment records shall never be presented as real financial transactions.
4.7 Digital Tickets
Each issued ticket shall include:
• A unique ticket identifier.
• Event and ticket-type information.
6


### SRS — страница 7

• Attendee information.
• A tamper-resistant QR code.
• Current status: valid, checked in, cancelled, or refunded.
Tickets shall be available through email and the attendee’s account.
• Attendees shall be able to download each ticket as a print-optimized PDF and print it
from a standard browser or PDF viewer.
• A printed ticket shall include the event name, date and time, venue, ticket type, attendee
name, assigned section/row/seat when applicable, ticket identifier, and QR code.
• Payment-card details and other unnecessary sensitive information shall not appear on
the printed ticket.
• The QR code shall remain large and clear enough to be scanned from a paper copy,
including when printed in grayscale.
• Digital and printed copies of the same ticket shall share one ticket identifier and shall not
create separate admissions.
4.8 Mobile Ticket Verification and Event Check-In
The system shall provide a dedicated mobile app for authorized event administrators. The app
shall allow them to:
• Sign in securely and view only assigned events.
• Scan ticket QR codes using the device camera.
• Validate ticket authenticity and status in real time.
• Display a clear valid, invalid, cancelled, refunded, or already-used result.
• Record a successful check-in and prevent the same ticket from being used twice.
• Search for attendees manually.
• Undo an accidental check-in where authorized.
• View the total number of registered and checked-in attendees.
• Synchronize check-in records with the central platform.
The academic MVP requires online verification only. Offline synchronization is deferred.
4.9 Orders, Cancellations, and Refunds
• Attendees shall be able to view their orders.
• Organizers shall be able to define a refund policy.
• Organizers shall be able to cancel free registrations.
• Authorized organizers shall be able to initiate full refunds.
• Refunded or cancelled tickets shall become invalid.
• All payment and refund actions shall be recorded in an audit log.
7


### SRS — страница 8

4.10 Notifications
The system shall send notifications for:
• Account verification
• Registration or purchase confirmation
• Payment failure
• Ticket delivery
• Event updates
• Event cancellation
• Refund completion
• Organizer payout status
• New support message, support-case assignment, and support-case status changes
4.11 Calendar Export
• Attendees shall be able to download event details as a standard iCalendar (.ics) file.
• The event page and order confirmation shall provide one-click options for common
calendar services.
• Calendar entries shall include the event title, start and end times, time zone, venue name
and address, description, and event URL.
• Calendar exports shall use a stable event identifier so updated event details can replace
an earlier calendar entry.
• When an event is cancelled, the system shall provide an updated cancellation calendar
file or link.
• Calendar export shall not require the platform to request write access to an attendee’s
calendar account.
4.12 Administration
Platform administrators shall be able to:
• Search for users, events, orders, and payments.
• Suspend users or events.
• Review reported events.
• Inspect paid-sales activation records.
• Monitor refunds, disputes, and payment failures.
• Configure activation fees and platform settings.
• Review escalated support cases and promotional-code activity.
• Export basic operational reports.
8


### SRS — страница 9

4.13 Support Chat and Case Management
• An attendee shall be able to open a support request from an event, order, or ticket page.
• An organizer shall be able to open a platform-support request concerning account, acti-
vation, payment, or technical issues.
• A support case shall automatically include the relevant user, event, order, and ticket
context when available.
• The requester shall select an issue category such as ticket delivery, payment, refund,
seating, event information, check-in, account, or technical problem.
• Each support case shall provide an asynchronous chat-like message thread.
• Attendees and organizer support staff shall be able to exchange messages within attendee
support cases.
• Organizers and Platform Admins shall be able to exchange messages within organizer
support cases.
• Authorized staff shall be able to assign a case and change its status among Open, In
Progress, Waiting for Customer, and Resolved.
• Users shall receive in-app or email notifications when a new reply or relevant status
change occurs.
• The system shall retain the case history and prevent users from viewing cases they are
not authorized to access.
• The academic MVP does not require typing indicators, presence information, voice
messages, AI chatbots, or real-time WebSocket delivery.
4.14 Promo Codes and Campaign QR Codes
• Organizers shall be able to create a promotional campaign for an event.
• A campaign may have a percentage or fixed-KZT discount, validity dates, maximum
redemptions, and applicable ticket types.
• The system shall generate a unique promo code and a special Campaign QR Code for the
campaign.
• The Campaign QR Code shall encode a trackable HTTPS event link containing an opaque
campaign or promo token rather than a discount amount trusted by the client.
• Scanning the Campaign QR Code shall open the correct event page and automatically
apply the associated promo code after server-side validation.
• The attendee shall see the applied code, discount, and updated order total before com-
pleting checkout.
• Expired, disabled, exhausted, or inapplicable codes shall be rejected with a clear message.
• The server shall calculate and validate all discounts and shall prevent redemption beyond
the campaign limit.
• The Campaign QR Code shall be visually and functionally distinct from an admission-
ticket QR code.
9


### SRS — страница 10

• The mobile ticket-verification app and admission endpoint shall never accept a Campaign
QR Code as permission to enter an event.
• BiletFlow shall record exact redemptions, orders, tickets sold, gross revenue, discount
amount, and net revenue for each campaign.
• GA4 may record campaign-link visits, checkout starts, and traffic attribution without
receiving attendee names, email addresses, phone numbers, ticket identifiers, or other
direct personal information.
4.15 Basic Organizer Analytics
• Each organizer shall have access only to analytics for events they manage.
• The dashboard shall show total ticket capacity, tickets sold, tickets remaining, and per-
centage sold.
• The dashboard shall show gross sales, discounts, refunds, and net demonstration revenue
in KZT.
• Organizers shall be able to view sales over time using order timestamps.
• Organizers shall be able to compare sales by ticket type.
• The dashboard shall show campaign and promo-code redemptions, tickets attributed to
each campaign, and resulting revenue.
• The dashboard shall show checked-in attendees, absent ticket holders, and the check-in
percentage after or during the event.
• Basic filters shall include event, date range, and ticket type.
• Required analytics shall be calculated from authoritative BiletFlow order, ticket, cam-
paign, refund, and check-in records.
• Basic analytics shall not require attendees to provide demographic information or com-
plete additional checkout fields.
• GA4 traffic, funnel, geographic, device, or demographic reporting is an optional advanced
analytics feature and is not required for the base MVP.
4.16 Organizer Event History and Audit Trail
• The organizer dashboard shall classify events as Upcoming, Active, Completed, or
Cancelled.
• Organizers shall be able to open completed and cancelled events and review their retained
tickets, orders, refunds, check-ins, promo campaigns, support cases, and basic analytics.
• Organizers shall be able to duplicate a past event into a new draft while excluding the
original event’s orders, tickets, payments, check-ins, and support cases.
• Each event shall provide a chronological activity timeline.
• The timeline shall include important actions such as event publication or cancellation,
ticket price or capacity changes, refunds, promo-code creation or disabling, support-case
status changes, check-ins, and check-in reversals.
10


### SRS — страница 11

• Each history entry shall contain a timestamp, acting user, action type, affected entity,
and short description.
• Organizers shall be able to filter history by date range and activity type.
• Organizer staff shall only see history for events they are authorized to manage; Platform
Admins may view history for moderation or support purposes.
• Audit entries shall not be editable or deletable through normal organizer interfaces.
• Full field-by-field version history, rollback, and permanent compliance archival are not
required for the academic MVP.
5. Example Use Cases
UC1: Organizer Creates a Free Event
Actor: Organizer
Precondition: Organizer has a verified account.
Flow: The organizer enters event details, creates a free ticket type, previews the event, and
publishes it.
Postcondition: Attendees can register without payment.
UC2: Organizer Activates Paid Ticket Sales
Actor: Organizer
Precondition: A draft event contains a paid ticket type.
Flow: The organizer completes verification, connects a payout account, pays the activation fee,
and accepts the terms.
Postcondition: Paid checkout becomes available for the event.
UC3: Attendee Purchases a Ticket
Actor: Attendee
Precondition: Paid sales are active and tickets are available.
Flow: The attendee selects tickets, enters required information, and completes payment.
Postcondition: An order and QR-code ticket are issued.
UC4: Event Admin Verifies and Checks In an Attendee
Actor: Event Admin
Precondition: The Event Admin is signed into the mobile app and assigned to the event.
Flow: The Event Admin selects the event and scans the attendee’s QR code. The mobile app
11


### SRS — страница 12

validates the ticket and records the check-in.
Postcondition: The ticket cannot be checked in again unless the previous action is reversed.
UC5: Organizer Refunds an Order
Actor: Organizer
Precondition: The order is eligible for a refund.
Flow: The organizer selects the order, confirms the refund, and the payment provider processes
it.
Postcondition: The ticket is invalidated and the attendee is notified.
UC6: Attendee Adds an Event to a Calendar
Actor: Attendee
Precondition: The attendee is viewing an event page, confirmation page, or issued ticket.
Flow: The attendee selects a calendar option or downloads the .ics file.
Postcondition: A calendar entry is prepared with the correct event time zone, venue name and
address, and event URL.
UC7: Attendee Prints a Ticket
Actor: Attendee
Precondition: A valid ticket has been issued.
Flow: The attendee opens the order or ticket, downloads the print-optimized PDF, and prints
it.
Postcondition: The paper ticket contains a readable QR code that the Event Admin mobile app
can verify at the entrance.
UC8: Attendee Selects an Assigned Seat
Actor: Attendee
Precondition: The event uses assigned seating and sales are open.
Flow: The attendee opens the interactive seat map, reviews seat availability and prices, selects
an available seat, and completes checkout before the temporary hold expires.
Postcondition: The purchased seat is linked to the order and ticket and is no longer available
to other attendees.
12


### SRS — страница 13

UC9: Attendee Requests Support
Actor: Attendee
Precondition: The attendee is viewing an event, order, or ticket.
Flow: The attendee selects support, chooses an issue category, writes a message, and submits
the case. The organizer replies through the support conversation.
Postcondition: The conversation and its event/order/ticket context are retained until the case
is resolved.
UC10: Attendee Purchases Through a Campaign QR Code
Actor: Attendee
Precondition: The organizer has an active promotional campaign with remaining redemptions.
Flow: The attendee scans the Campaign QR Code, opens the event page with the promo code
pre-applied, selects tickets, reviews the discount, and completes checkout.
Postcondition: The discount is recorded on the order and the sale is attributed to the correct
campaign.
UC11: Organizer Reviews Basic Analytics
Actor: Organizer
Precondition: The organizer manages an event with ticket, order, campaign, or check-in
activity.
Flow: The organizer opens the event dashboard, selects a date range or ticket type, and reviews
sales progress, revenue, campaign performance, and attendance.
Postcondition: The organizer sees metrics calculated from BiletFlow records without collecting
additional attendee information.
UC12: Organizer Reviews and Reuses Event History
Actor: Organizer
Precondition: The organizer manages at least one completed or cancelled event.
Flow: The organizer opens the past-events view, reviews the event activity timeline and retained
operational records, then duplicates the event into a new draft.
Postcondition: Historical records remain unchanged and the new draft contains reusable event
configuration without copying old transactions or attendees.
13


### SRS — страница 14

6. Core Data Entities
• User
• Organizer Profile
• Event
• Venue
• Venue Section
• Row
• Seat
• Seat Hold
• Ticket Type
• Order
• Order Item
• Ticket
• Attendee
• Payment
• Refund
• Payout Account
• Check-In Record
• Staff Assignment
• Notification
• Support Case
• Support Message
• Promotional Campaign
• Promo Code
• Promo Redemption
• Audit Log
7. Non-Functional Requirements
• The platform should support modern desktop and mobile browsers.
• The ticket-verification app shall support current iOS and Android versions selected for
the MVP.
• The customer-facing interface shall initially support Kazakh and Russian, with English
available as an additional locale.
• Prices, fees, refunds, and payouts shall use KZT for the initial Kazakhstan release.
• Sensitive information shall be encrypted in transit and at rest.
• Passwords shall be stored using secure password hashing.
• Payment-card data shall not be stored directly by the platform.
• Organizer and administrator actions shall be auditable.
• Event pages should meet WCAG 2.1 AA accessibility guidelines.
• The checkout process should remain usable under temporary increases in event traffic.
14


### SRS — страница 15

• Seat availability shall update promptly, and checkout shall use an atomic reservation
process to prevent double-selling a seat.
• The interactive seat map shall be usable on desktop and mobile screens and provide
accessible labels in addition to color indicators.
• QR validation should normally complete within two seconds with an internet connection.
• Printable tickets shall produce legible text and reliably scannable QR codes on standard
A4 paper in color or grayscale.
• Calendar exports shall preserve the event’s configured time zone.
• Support-case access shall be enforced by role and by relationship to the relevant event,
order, or ticket.
• Promo-code validation and redemption limits shall be enforced atomically on the server.
• Campaign QR links shall not contain trusted price or discount values and shall never be
accepted by ticket-verification endpoints.
• Analytics queries and chart generation shall not block or delay ticket selection, checkout,
payment confirmation, or ticket issuance.
• Organizer history and audit data shall be protected by the same event-level authorization
rules as the underlying operational records.
• The architecture should support additional currencies and languages in future releases.
• Regular backups and recovery procedures shall be established.
8. MVP Scope
Required MVP Features
• User registration and authentication
• Organizer profiles
• Event creation and publication
• Free and paid ticket types
• Simulated or sandboxed paid-sales activation
• Simulated or sandboxed KZT checkout
• QR-code ticket generation
• Downloadable and printable PDF tickets
• Email confirmations
• Attendee and order management
• Dedicated iOS and Android ticket-verification app for Event Admins
• Basic cancellations and refunds
• Administrative moderation
• Basic organizer analytics for capacity, sales over time, revenue, ticket types, campaigns,
and attendance
• Organizer event history with past/completed/cancelled views, event duplication, and an
activity timeline
• Asynchronous support chat with case status and contextual event/order/ticket links
15


### SRS — страница 16

• Promo codes with special Campaign QR Codes and basic campaign sales reporting
• Docker-based local or demonstration deployment
Bonus and Stretch Features
• One predefined assigned-seating layout with an interactive seat-selection UI
• Calendar export through .ics files and common calendar links
• Advanced organizer analytics using GA4 traffic/funnel data combined with authoritative
BiletFlow order data
• Offline ticket-verification synchronization
• Support-message file attachments or enhanced real-time delivery
Excluded from the Initial MVP
• Real-money organizer payouts and production financial processing
• Production KYC/KYB or identity-verification workflows
• Visual venue-layout designer and arbitrary venue imports
• Production-grade offline scanner synchronization
• Advanced refund and dispute workflows
• App Store and Google Play publication
• Ticket resale or transfer marketplace
• Native attendee and organizer mobile applications
• Affiliate marketing
• Recurring events
• Advanced marketing automation
• On-site hardware integrations
• Multiple organizer payout splits
• Detailed accounting and tax automation
• Full field-by-field version history, rollback, and production compliance archival
9. Suggested Technology Stack
The frontend and mobile technologies are recommended for consistency, while the team may
choose the backend language that best matches its experience. The academic MVP shall use
one primary backend implementation; creating the same services in multiple languages or
introducing unnecessary microservices is outside the term scope.
• Database: PostgreSQL or MongoDB with Mongoose. PostgreSQL may be paired with
Node.js, Python, Go, or Java; selecting Node.js does not require MongoDB.
16


### SRS — страница 17

• Backend Option 1 - JavaScript/TypeScript: Node.js with Express or a comparable frame-
work; this produces a MERN-style stack when combined with MongoDB and React
• Backend Option 2 - Python: FastAPI or Django
• Backend Option 3 - Go: Go with a lightweight HTTP framework or the standard HTTP
library
• Backend Option 4 - Java: Spring Boot
• Web Application: React; Next.js may be used when server-side rendering or search
visibility is needed
• Seat Map UI: React with SVG or Canvas rendering, one predefined layout, and server-
validated seat holds
• Mobile Ticket-Verification App: React Native, optionally with Expo
• Frontend Language: TypeScript is recommended across the web application and React
Native app; it may also be shared with the backend when Node.js is selected
• Styling: Tailwind CSS
• Payments: Provider sandbox or internal simulation using KZT; production provider
integration is deferred
• Email: Transactional email provider
• File Storage: S3-compatible object storage
• Printable Tickets: Server-generated PDF based on the canonical ticket record
• Support Chat: REST API with periodic refresh or lightweight polling; real-time sockets
are optional and not required
• Campaign QR Codes: Server-generated QR images containing signed or opaque promo-
tional links
• Analytics: Database aggregation for exact sales/redemption data and optional GA4
ecommerce/campaign events for traffic attribution
• Deployment: Docker containers
• Design: Figma
• Testing: Automated API, interface, payment, and QR-validation tests
The backend language and database shall be selected during the initial architecture phase and
documented with a short rationale covering team familiarity, development speed, data-model
requirements, and deployment complexity.
10. Assumptions and Dependencies
• The team can access a suitable payment sandbox or implement a clearly labelled payment
simulation.
• The initial release will operate in Kazakhstan and use KZT as its settlement currency.
• Payment, privacy, refund, and organizer-verification rules will be reviewed for compliance
with applicable Kazakhstan requirements before launch.
• Organizers are responsible for event legality, descriptions, and refund policies.
• Attendees have access to email or an online account for ticket delivery.
17


### SRS — страница 18

• Event Admins have supported iOS or Android devices with working cameras.
• Event venues provide internet access for real-time check-in; offline check-in is outside
the academic MVP.
• AI-assisted tools may be used during development; this document does not prescribe a
particular tool or AI-assisted workflow.
• Final production fees, supported payment methods, payment provider, and payout timing
remain future decisions.
11. Initial Success Criteria
The MVP will be considered successful when:
• An organizer can publish a free event and distribute valid tickets.
• An organizer can complete the simulated or sandboxed paid-sales activation and receive
demonstration orders.
• An attendee can complete checkout and receive a QR-code ticket.
• An attendee can download and print a ticket that remains scannable at check-in.
• An Event Admin can use the mobile app to validate tickets and prevent duplicate entry.
• An attendee can open a contextual support case and exchange asynchronous messages
with authorized organizer staff.
• An attendee can scan a Campaign QR Code, receive a valid discount, and complete an
order attributed to the campaign.
• An admission scanner rejects Campaign QR Codes while continuing to accept valid ticket
QR codes.
• Organizers can view accurate ticket, attendance, payment, and refund records.
• Organizers can view basic sales, capacity, campaign, and attendance analytics without
adding fields to the attendee checkout.
• Organizers can review past and cancelled events, inspect an authorized activity timeline,
and duplicate a past event without copying historical transactions.
• Administrators can suspend a suspicious event and stop further sales.
Bonus features are evaluated separately and are not required to satisfy the base MVP success
criteria.
12. Key Decisions for the Next Draft
• Final project and product name
• Final backend selection among Node.js, Python, Go, and Java, together with MongoDB
or PostgreSQL
• Activation fee amount and refundability
• Payment sandbox or simulation method for the academic MVP
18


### SRS — страница 19

• Whether attendees must create accounts
• Whether processing fees are paid by organizers or attendees
• Payout delay and reserve policy
• Organizer verification requirements
• Event cancellation and refund rules
• Predefined seating layout used for the demonstration
• Whether support cases allow file attachments in the academic MVP
• Initial promo-code discount types, redemption limits, and campaign reporting fields
• Default date ranges and chart formats for the basic organizer dashboard
• Academic retention period for event history and audit entries
13. Term Feasibility and Delivery Plan
13.1 Feasibility Target
The project is planned as a polished academic prototype developed by a team of five over 10–12
weeks. The team may use AI-assisted development tools. The term deliverable is not intended
to be a production financial platform.
The MVP is feasible only if the team maintains the scope boundaries in Section 8. Real payments,
real payouts, production identity verification, arbitrary venue-map creation, offline scanner
synchronization, and application-store publication are not term requirements.
13.2 Suggested Team Ownership
Each area shall have one primary owner, with peer review from at least one other team mem-
ber:
1. Architecture, integration, authentication, and deployment
2. Backend event, ticket, order, and seat-reservation services
3. Organizer and attendee web interfaces
4. Admin interface, promotional campaigns, basic reporting, organizer history, calendar
bonus, and printable tickets
5. React Native verification app, support workflow, assigned-seating bonus, automated
testing, and release coordination
Ownership does not prevent collaboration. Shared API contracts and data models should be
agreed before parallel implementation begins.
19


### SRS — страница 20

13.3 Suggested 12-Week Schedule
• Weeks 1–2: select one backend stack, confirm scope, prepare wireframes, define API
contracts and data model, and configure repositories and automated checks
• Weeks 3–4: implement authentication, roles, organizer profiles, and event creation
• Weeks 5–6: implement ticket types, inventory, sandbox checkout, orders, and QR gener-
ation
• Week 7: implement printable PDF tickets, promo codes, and Campaign QR Codes; add
calendar export only if the core flow is on schedule
• Week 8: implement the React Native online verification app and asynchronous support
workflow
• Week 9: implement basic administration, organizer history, and the required analytics
dashboard; add assigned seating or advanced GA4 analytics only if the core flow is stable
• Week 10: integrate features, resolve cross-application defects, and complete core-flow
tests
• Weeks 11–12: stabilize, improve usability, prepare documentation, rehearse the demon-
stration, and retain contingency time
For a 10-week term, Weeks 7–9 should overlap where team capacity permits, while Week 10
remains reserved for integration and stabilization.
13.4 Scope and Quality Controls
• Core end-to-end flow takes priority: create event, distribute a campaign QR, apply a
promo code, select or reserve a ticket, complete simulated checkout, issue the ticket,
request support, and verify entry.
• Feature development should stop after Week 9 unless a missing feature blocks the core
demonstration.
• Each feature is complete only when integrated, reviewed, tested, and documented.
• Bonus features shall not be started at the expense of an incomplete required flow.
• If the project falls behind, remove assigned seating, calendar export, advanced analytics,
localization polish, and refund simulation before cutting the core ticketing flow.
20


---

# Part D — Architecture checkpoint, 2026-11-09 (REVIEW DRAFT)

> This checkpoint documents decisions made **after** the last integrated GA/Event Changes draft. It is an additive review register, not production-ready DDL. Earlier contradictory proposals are explicitly superseded below. No claim is made that backend code or bank integrations have been implemented.

## D1. GA-23/24 — new Ticket Type items in one Change Request

- Multiple `CREATE_TICKET_TYPE` items are permitted in one Event Change Request, each with `target_id = NULL` and structured `new_value`.
- The event-field partial unique index must exclude `CREATE_TICKET_TYPE`; existing-target uniqueness `(change_request_id, field, target_id)` remains enforced for non-null targets.
- Extend field/target CHECK to accept this create operation. Validate all creations before applying; apply atomically with the request decision.
- GA-23 closes the GA/Assigned Seating review at the business-rule level; this does not mean all DDL/integration tests are complete.

## D2. Cancellation request during review — C42 REAFFIRMED; CR-02/CR-03 REVOKED

- Filing a `PENDING` Event Cancellation Request **does not pause sales** and does not block new Reservations, Payments, ticket issuance or Check-in merely by being pending.
- Event remains `PUBLISHED`; ordinary sales and check-in eligibility rules continue until cancellation approval.
- On approval, Event transitions atomically to `CANCELLED`; subsequent sales/issuance/check-in are blocked, and approved cancellation processing begins.
- Earlier conversational CR-02/CR-03 proposals for pausing sales immediately on submission are **not approved** and MUST NOT be implemented.
- Check-in remains available for valid tickets while the cancellation request is pending (CR-04 clarification).

## D3. CR-01/05 — Organizer-initiated full Order Refund

- Authorized Organizer may initiate a **full-Order** refund without Platform Admin approval, independently of customer request; no Event-wide sales pause.
- Add `ORGANIZER_INITIATED` to `refund_requests.source`. Record approved authorization and process via existing Refund Service, with immutable financial identity, Order locks, payment-success verification, no successful/unfinished conflicting refunds, provider idempotency, audit and notifications.
- Organizer cannot initiate this refund when **any** ticket of the Order has a currently effective Check-in. Reversed erroneous Check-in may restore eligibility if all other checks pass (CR-06).
- Check-in validation and refund approval must serialize safely; neither may pass a stale pre-lock check.

## D4. CR-07–CR-10 — ticket access during refund

- On `refund_request = APPROVED`, immediately deny new Check-in for affected Order tickets, without prematurely marking them `REFUNDED`.
- During unfinished/UNKNOWN provider operations, continue denying Check-in; UNKNOWN requires reconciliation.
- Only confirmed `Refund = SUCCEEDED` causes final ticket `REFUNDED` state.
- For `ORGANIZER_INITIATED` only: after the **entire** voluntary refund procedure is conclusively unsuccessful (not merely one FAILED attempt), and no unresolved provider operation or late success remains possible, automatically remove the temporary Check-in block if Event and Ticket remain otherwise eligible. Notify buyer and Organizer.
- For mandatory event cancellation and other mandatory refund obligations, never automatically restore ticket validity merely because a provider attempt failed; escalate according to existing rules.
- Keep Refund Request `APPROVED` as historical authorization even when all voluntary attempts conclusively fail; banking result lives in Refund attempts. Backend must derive effective Check-in blocking from the whole chain, not solely the approved status.
- The exact durable criterion for 'entire procedure conclusively unsuccessful' and its race-safe provider reconciliation must be specified and tested before production. This is a critical implementation gate.

## D5. CR-11/12 — reinitiating voluntary refund

- After conclusive final failure of a previous `ORGANIZER_INITIATED` chain, Organizer may create a new Refund Request for the same Order, retaining prior history.
- Reject new requests if any successful, pending, processing or UNKNOWN refund exists; recheck effective Check-in and financial eligibility transactionally.
- The five SYSTEM-attempt limit applies to the previously approved mandatory automatic retry scenario, **not** to the number of separate Organizer-initiated requests. Enforce rate limiting and provider-safe idempotency.

## D6. Decision still OPEN

- CR-13: whether Organizer-initiated full refund is permitted after Event `COMPLETED` when no ticket has effective Check-in. Proposed, **not yet approved**.
- Reconcile all new refund-source values and approval/attempt eligibility with the exact final Refund FSM and provider constraints.
- Bank settlement, payout/reserve and insufficient-organizer-funds handling remain provider-dependent/OPEN. Do not invent organizer balance or bank guarantees.

## D7. Evidence and limitations

- PostgreSQL C57/C58 tests were performed on isolated `test_c57_*` and `test_c58_*` tables: FK membership, uniqueness, CHECK, rollback/atomicity, sequential idempotency, and two-session approval/withdrawal races. Recovery-action SQL classification was exercised, **not** the actual background worker.
- The draft retains historical v0.2 sections and addenda; a clean, fully reconciled canonical document, production DDL, migrations, integration tests and complete SRS traceability are **not finished**.
- Do not label this checkpoint as a finalized v0.3 Source of Truth; keep v0.2 as authoritative for unchanged areas and explicitly approved subsequent decisions as superseding specific old rules.
