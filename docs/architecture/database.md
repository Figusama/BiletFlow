# BiletFlow Database & Backend Architecture --- Source of Truth

**Document version:** 0.1\
**Status:** In development --- authoritative for all sections marked
**FINAL**\
**Last updated:** 2026-10-12\
**Scope of this version:** Identity/authentication, roles, event
applications and approval, events, moderated changes, venues and seating
foundation, ticket types, inventory reservations, orders, promo-code
checkout boundary, and asynchronous payment boundary.

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

## 18. Editable vs moderated event data --- FINAL

### 18.1 Organizer-editable operational fields

Organizer may edit these directly, including while an Event Change
Request is pending:

-   visibility;
-   public contact fields;
-   ticket configuration allowed by current lifecycle;
-   ticket prices;
-   ticket sales windows;
-   sales pause/resume;
-   assigned-seat `is_enabled` where allowed;
-   assignment of ticket types to seats;
-   Event Admin assignments/invitations;
-   Staff Passes;
-   promo/campaign configuration.

### 18.2 Moderated fields

Organizer cannot directly edit:

``` text
TITLE
DESCRIPTION
CATEGORIES
IMAGES
VENUE
START_AT
END_AT
SEATING_MODE
VENUE_LAYOUT
RESPONSIBLE_NAME
RESPONSIBLE_EMAIL
RESPONSIBLE_PHONE
```

These fields are changed only through `EventChangeRequest` and Platform
Admin approval.

The allowed field names are represented as a typed backend
`EventChangeField` enum. Adding a new moderated field extends the
enum/handler without requiring a redesign of the request tables.

------------------------------------------------------------------------

## 19. Event Change Request --- FINAL

### 19.1 Request table

``` text
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

### 19.2 Request items

``` text
event_change_request_items
- id                  UUID PK
- change_request_id   UUID FK -> event_change_requests NOT NULL
- field               event_change_field NOT NULL
- old_value           JSONB NOT NULL
- new_value           JSONB NOT NULL
- created_at          TIMESTAMPTZ NOT NULL
UNIQUE(change_request_id, field)
```

The UI uses `+ Add change`; once a field is included, it is removed from
the selectable list for that request.

`comment` is optional and can explain the reason for the changes.

### 19.3 Lifecycle

-   `DRAFT`: Organizer freely adds/removes/edits proposed items.
-   `PENDING`: request content becomes immutable.
-   Only one pending change request is allowed per event.
-   Operational event fields remain editable while the request is
    pending because they do not overlap with moderated fields.
-   Platform Admin approves or rejects the entire request; no partial
    approval in v0.1.
-   Rejection may include a review comment explaining what must be
    resubmitted.

### 19.4 Applying changes

Organizer proposes values; Platform Admin does **not** manually retype
them. `Approve & Apply` causes backend, acting under Platform Admin
authorization, to apply the approved request atomically:

``` text
BEGIN
  validate all request items
  apply all moderated changes
  mark request APPROVED
  store reviewer and reviewed_at
  write audit entries
COMMIT
```

If any item cannot be applied, the entire transaction rolls back.

### 19.5 Historical values

`old_value` is retained for audit/review even though the event currently
stores the active value.

------------------------------------------------------------------------

## 20. Images in Event Change Requests --- FINAL

New proposed images are uploaded to BiletFlow-controlled object storage
before review, using a temporary/change-request namespace.

The change item references storage keys in `new_value`. Platform Admin
receives temporary/presigned access URLs for review.

-   Approval promotes/relinks the approved files into event image
    metadata.
-   Rejection/withdrawal leaves the event unchanged and temporary files
    are eligible for cleanup.
-   Arbitrary external URLs are not used as the authoritative approved
    image source.

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

## 23. Seating modes --- FINAL

``` text
GENERAL_ADMISSION
ASSIGNED_SEATING
```

### 23.1 General Admission

-   exactly one ticket type for the event;
-   no individual seat selection;
-   ticket type `quantity_total` is set by Organizer;
-   effective event capacity equals that ticket type's `quantity_total`;
-   `quantity_total <= venue.max_capacity`.

### 23.2 Assigned Seating

-   one or more ticket types;
-   concrete seats are selected;
-   Organizer does **not** manually enter `quantity_total` for ticket
    types;
-   ticket-type quantity is computed from enabled event seats assigned
    to that ticket type;
-   event capacity is computed from enabled event seats.

------------------------------------------------------------------------

## 24. `event_seats` --- FINAL

For an Assigned Seating event, the event gets a row for every seat in
its selected predefined layout.

``` text
event_seats
- id               UUID PK
- event_id         UUID FK -> events NOT NULL
- seat_id          UUID FK -> venue_seats NOT NULL
- ticket_type_id   UUID FK -> ticket_types NULL during Draft configuration
- is_enabled       BOOLEAN NOT NULL DEFAULT TRUE
- created_at       TIMESTAMPTZ NOT NULL
- updated_at       TIMESTAMPTZ NOT NULL
UNIQUE(event_id, seat_id)
```

After approval/event creation, all layout seats are initially available
to the event. Organizer may disable seats while configuring the event.

Example:

``` text
Venue maximum/layout seats: 3000
Disabled event seats:        250
Effective event capacity:   2750
```

For Assigned Seating, effective capacity is computed as:

``` text
COUNT(event_seats WHERE event_id = ? AND is_enabled = TRUE)
```

Before publishing, every enabled event seat must be assigned to exactly
one ticket type.

Organizer cannot disable a seat that is already committed to an issued
ticket or currently protected by an active reservation.

### 24.1 Seat pricing

Price belongs to the event's ticket type, not the physical seat.

The same physical seat can therefore be VIP at one event and Standard at
another event with a different price.

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

`quantity_total` is manually configured and must be positive and no
greater than venue maximum capacity.

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

``` text
reservations
- id            UUID PK
- event_id      UUID FK -> events NOT NULL
- user_id       UUID FK -> users NOT NULL
- expires_at    TIMESTAMPTZ NOT NULL
- status        ACTIVE | CONVERTED | RELEASED NOT NULL
- created_at    TIMESTAMPTZ NOT NULL
- converted_at  TIMESTAMPTZ NULL
- released_at   TIMESTAMPTZ NULL
```

`EXPIRED` is computed:

``` text
status = ACTIVE AND expires_at <= now()
```

No scheduled status update is required merely to mark expiration.

Meaning:

-   `ACTIVE`: inventory is temporarily held;
-   `CONVERTED`: successful checkout/order confirmation converted
    inventory into issued tickets;
-   `RELEASED`: hold explicitly released before expiry.

The exact reservation TTL is configuration, not schema.

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

Because General Admission has exactly one ticket type, a reservation
normally has one item with the selected quantity.

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
5.  Verify no non-expired active reservation item currently holds the
    seat.
6.  Create reservation + items.
7.  Commit.

Concurrent attempts for the same seat serialize through row locking;
only one succeeds.

### 32.2 General Admission

When reserving quantity:

1.  Begin transaction.
2.  Lock the General Admission `ticket_type` row.
3.  Calculate committed/issued quantity plus quantities in non-expired
    active reservations.
4.  Ensure requested quantity fits within `quantity_total`.
5.  Create reservation + item.
6.  Commit.

This prevents overselling the final tickets under concurrent requests.

### 32.3 Quantity changes while holds exist

For General Admission, Organizer cannot reduce `quantity_total` below
already issued inventory plus inventory currently held by active
non-expired reservations.

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

For paid checkout:

1.  Revalidate reservation/inventory.
2.  Revalidate promo if supplied.
3.  Freeze backend-calculated subtotal/discount/total in Order.
4.  Create `Order(PENDING)` and immutable `order_items`.
5.  Create any required `promo_hold`.
6.  Create `Payment(PENDING)`.
7.  Commit this short database transaction.
8.  Perform asynchronous provider/sandbox payment flow.
9.  Process provider result/webhook idempotently.

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

Detailed payment/webhook tables are the next architecture block and are
**not yet finalized**.

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
expires_at <= now() -> EXPIRED
otherwise            -> ACTIVE
```

Available limited promo capacity is conceptually:

``` text
max_redemptions
- successful redemption_count
- active non-expired promo_holds
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

Failed/expired payment releases the promo hold. No `promo_redemption` is
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
webhook/payment idempotency will enforce this in the next architecture
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
ACTIVE | CONVERTED | RELEASED
```

Computed:

``` text
EXPIRED = ACTIVE and expires_at <= now()
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
19. General Admission has exactly one ticket type.
20. Assigned Seating ticket quantities are computed from enabled
    assigned event seats.
21. Assigned Seating event capacity is computed from enabled event
    seats.
22. General Admission capacity equals its single ticket type's
    `quantity_total`.
23. Effective capacity must not exceed venue maximum capacity.
24. Physical seat price is never stored on `venue_seats`; event ticket
    type defines price.
25. Before publishing Assigned Seating, every enabled seat has exactly
    one ticket type.
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
35. Promo redemption is recorded only after successful payment/order
    confirmation.
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

1.  `payments` final fields/statuses.
2.  Payment provider/sandbox request lifecycle.
3.  `payment_webhook_events` / webhook idempotency implementation.
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
v0.2  payments + tickets + check-in
v0.3  activation + cancellation/refunds + invitations/promotions
v1.0  complete reviewed schema aligned with SRS
```

------------------------------------------------------------------------

## 54. Current architecture checkpoint

As of v0.1, the team has a coherent end-to-end foundation through the
paid-checkout boundary:

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
