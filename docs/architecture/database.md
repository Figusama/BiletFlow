# Handoff integrity update — v1.0 REVIEW CANDIDATE (2026-11-14)

**Status:** review candidate, not execution-verified. The companion file is `BiletFlow_schema_v0.4_handoff_candidate.sql`. Backend owns service FSM transitions, capacity, refund attempt limits, durable provider operations and concurrency tests. No additional business triggers have been introduced.

## Change Log — v0.9 to v1.0 review candidate

| ID | Was | Now | Why |
|---|---|---|---|
| SQL-04 | Agreement user FK and application FK were independent. | Composite FK `(application_id,user_id)` to `(event_applications.id,applicant_user_id)` plus parent UNIQUE. | Prevent another user being recorded as applicant's consenting actor. |
| SQL-05 | Support Order/Ticket links had independent FKs. | Composite FK `(order_id,event_id)` and `(ticket_id,event_id)` when `event_id` is supplied. | Prevent cross-Event Support references. For nullable Event on PLATFORM_SUPPORT, backend must validate ownership and access. |
| BE-01 | SQL review listed unresolved cross-row limits. | Explicitly delegated to backend transactions under DL-01; no complex triggers added. | Keep PostgreSQL simple and business logic in services. |

**Execution gate:** Run companion SQL in a clean PostgreSQL 16 database; verify all DDL and inspect `pg_catalog`. Static checks cannot certify executable correctness. Test multi-session inventory/refund/payment races and provider integration before deployment.

---

# BiletFlow Database & Backend Architecture — v1.0 HANDOFF REVIEW

**Document version:** 1.0 HANDOFF REVIEW — 2026-11-14; approved contracts synchronized across legacy sections; integrated executable SQL and backend testing outstanding  
**Authority:** v0.3 FINAL and subsequently approved v0.4 domain decisions N-01–N-08, S-01–S-14, A-01–A-03 are incorporated. This consolidated review includes owner-approved A01/A02, AN-01–AN-03, ED-01 and ADM-01–ADM-03, plus the suspension-related system refund decision. It is NOT a production-ready schema or proof of PostgreSQL execution. Owner-approved ADM-02/ADM-03 and the system-refund suspension rule are incorporated; external integration gates remain OPEN.  
**Scope:** Identity, Events, Inventory, Checkout/Payments, Refunds, Tickets/Check-in, Invitations, Paid Sales Activation, Promotions, Notifications/Inbox/Outbox, Support, Audit/Event History, Analytics semantics and backend invariants. Outstanding decisions and implementation gates are listed in §51 and Part L.  
**SRS:** `BiletFlow_SRS_Initial_Draft.pdf` is the separate product-requirements source; it is not duplicated in this document.  
**Testing responsibility:** Backend team executes PostgreSQL migrations, concurrency tests and provider/sandbox integration tests. Architecture review does not claim those tests passed.  

## Change Log — v0.9 static DDL audit (2026-11-14)

| ID | Было (v0.8 / SQL candidate v0.1) | Стало (v0.9 / SQL candidate v0.2) | Почему |
|---|---|---|---|
| SQL-01 | Payment FSM CHECK мог пропустить NULL как UNKNOWN SQL-логики. | Полное выражение проверки комбинаций заканчивается `IS TRUE`. | PostgreSQL CHECK пропускает UNKNOWN; это недопустимо для FSM. |
| SQL-02 | Проверка комбинаций состояний webhook не использовала явное `IS TRUE`. | Добавлена NULL-безопасная проверка. | Защита при изменении nullable-колонок и миграциях. |
| SQL-03 | Проверка `refund_requests.execution_finalized_at` была чувствительна к NULL. | Явно перечислены случаи NULL, промежуточного и финального исполнения. | Исключить ошибочные сочетания статуса и времени финализации. |
| SQL-04 | Ticket ссылался на Order Item без составной проверки Event/Type. | Добавлен составной FK `(order_item_id,order_id,event_id,ticket_type_id)`. | Исключить межсобытийное и межтиповое несоответствие при выдаче. |
| SQL-05 | Недоставало ряда индексов на горячих запросах и worker due-queues. | Добавлены целевые индексы, не меняющие бизнес-семантику. | Ускорить проверку занятости, возвратов и восстановление фоновых задач. |
| SQL-06 | Отсутствовал отдельный реестр доказанных и недоказанных проверок текущего SQL. | Добавлен настоящий раздел «DDL audit status» ниже. | Не путать статический анализ с исполнением PostgreSQL и интеграционными тестами. |

**Исторический статус v0.9:** статическая интеграционная ревизия; текущая v1.0 остаётся HANDOFF REVIEW до исполнения SQL. Решения QR-01, RF-01, AG-01 и остальные утверждённые контракты сохраняются.

## Change Log — v0.8 decisions and integration corrections

| ID | Was | Now | Why / affected sections |
|---|---|---|---|
| DL-01-C | DDL inventory flagged Event Change Request lock order as conflicting. | §E7 exception is canonical: Event → Event Change/Cancellation Request (when needed) → Inventory → Promo → Order → Reservation → Payment → Refund Request → Refund → Ticket → Check-in. | False-positive audit finding; clarify ordering without altering approved concurrency rules (§19.3, §E7). |
| GA-23-C | Older §B3 partial unique rule could forbid multiple CREATE_TICKET_TYPE items. | Exclude CREATE_TICKET_TYPE from NULL-target partial uniqueness; keep non-NULL target uniqueness. | Match approved GA-23/24 (§B3, §19.2, §D1). |
| QR-01 | H2 illustrated a hash-only campaign token without reproducible URL source. | Use stable public `promo_codes.campaign_token UUID UNIQUE NULL`, required iff campaign_id is present; remove campaign_token_hash. | Public marketing QR must be reproducible; not an admission/private-access credential (§H2, H5, H7). |
| RF-01 | Event suspension mandatory refund had no specific refund request source. | Add `EVENT_SUSPENSION` to `refund_requests.source`, approved automatically after independently verified successful capture without ticket issuance. | Accurate cause and one existing Refund Service; no new Refund FSM (§B6, §L4, §D6A). |
| AG-01 | Application stored one pair of Organizer Terms columns; later contract requires two independent consents. | `event_application_agreements` stores one current acceptance per application/document type, version, actor, time; remove old pair from event_applications. | Enforce both Organizer Rules and Ticket Sales/Refund & Financial Responsibility Terms (§9, §12, §B6/B7, §L3). |
| DOC-09 | §D7 claimed v0.2 was still normative and v0.3 not finalized. | Current document is sole architecture SoT; historical drafts are evidence, not competing instructions. | Prevent stale version precedence. |
| BANK-01 | Provider unknown/retry guarantees remain unverified. | Retain all approved UNKNOWN/reconciliation safety rules; require durable operation identity/work and external provider verification before enabling financial retries. | No invented Halyk idempotency or finality guarantees (§58, §D6A, §G7). |

**Status:** These are approved decisions or non-product reconciliations. They do not assert that the full PostgreSQL schema has been executed or that Halyk capabilities are verified.

## Change Log — v0.7 reconciliation of v0.6 (no new product decisions)

| ID | Was in v0.6 | Now in v0.7 | Why |
|---|---|---|---|
| DOC-01 | Title v0.6, metadata v0.5. | Both identify v0.7 INTEGRATED REVIEW. | Remove version ambiguity. |
| DOC-02 | Five capabilities listed, then “four roles”. | Clarified global vs event-scoped role storage. | Avoid incorrect RBAC implementation. |
| DOC-03 | `events` overview omitted approved suspension, GA capacity and terms-version fields. | Added fields to overview and pointed to domain contracts. | Keep overview aligned with approved architecture. |
| DOC-04 | §19.2 still called multiple CREATE_TICKET_TYPE items OPEN. | Applied approved GA-23/24 index exception. | Prevent implementation of obsolete uniqueness rule. |
| DOC-05 | §47 said generic audit schema pending. | Points to approved Part K; only executable SQL pending. | Distinguish logical design from physical integration. |
| DOC-06 | Legacy Event Admin-only wording remained in headings, checklist and instructions. | Generalized to Event Staff with independent EVENT_SUPPORT. | Match A02 across sections. |
| DOC-07 | Notifications were described as undesigned in a legacy paragraph. | Part I identified as approved logical contract. | Remove outdated module status. |
| DOC-08 | Part L could be read as overriding contradictory old prose. | Normative sections synchronized; Part L retained as cross-domain index. | Reduce ambiguous instructions for two backend developers. |

**Scope note:** This revision corrects documentation consistency. It does not claim a full executable physical schema or change approved Payment/Refund FSMs.

## Change Log — owner-approved changes relative to v0.4 and v0.5 review

> This table records changed **contracts**, not claims of executed SQL. The "Was" column describes the previous document state, not necessarily a deployed database. The "Now" column is binding for the current document. Historical alternative wording in earlier sections is superseded where it conflicts with these decisions.

| ID | Was | Now | Why / affected contracts |
|---|---|---|---|
| A01 | §H7 lock-order wording could be read inconsistently with §E7. | §E7 DL-01 is canonical: Event → inventory → Promo Code → Order → Reservation → Payment → refund/ticket/check-in locks when relevant. | Avoid opposite lock acquisition in H7 and cross-domain transactions. |
| A02 | Staff invitation was EVENT_ADMIN-only; earlier role summary omitted EVENT_SUPPORT. | `event_user_roles` includes `EVENT_SUPPORT`; shared `event_staff_invitations.invited_role` supports EVENT_ADMIN and EVENT_SUPPORT, independently. | Match approved Support staff workflow; Parts I/E/J/Notifications. |
| AN-01 | `sold` could mean ever issued or currently valid. | `sold` counts current `VALID`/`CHECKED_IN` tickets; ever-issued is separate; occupancy/availability use inventory rules. | Consistent organizer dashboard; Part L5. |
| AN-02 | Revenue and estimated organizer proceeds were not given one cross-domain metric contract. | Separate gross, discount, collected, successful refund, net, estimated proceeds; no claim of actual payout. | Prevent misleading financial reporting; Part L5. |
| AN-03 | Refunded and resold capacity could be conflated with historical sales. | Historical confirmed sales remain; current occupancy is calculated separately. | Prevent double counting; Part L5. |
| ED-01 | SRS duplication had no explicit moderated-application path. | Duplicate creates a prefilled `event_applications(DRAFT)`; a new Event only follows normal approval. | Preserve moderation and historical isolation; Part L3. |
| ADM-01 | Event had no general administrative suspension distinct from lifecycle/paid activation. | Event-level suspension blocks new sales, issuance and Check-in, without invalidating already issued Tickets. | SRS administration and security; Part L4. |
| ADM-01-R | Delayed successful payment during Event suspension had unresolved ticket/refund outcome. | No new ticket issuance; verified successful charge without issued tickets creates a mandatory full system refund obligation, resolved through approved Refund Service/reconciliation. | Prevent captured funds without admission; Part L4. |
| ADM-02 | Admin-editable activation fee remained an open SRS-vs-SoT scope question. | MVP fee remains backend-configured at 30,000 KZT per Event, frozen for the relevant activation fee attempt; no Admin tariff UI/table. | Preserve PSA-08 and MVP scope; Parts G/L7. |
| ADM-03 | User-facing Request New Venue remained an open scope question. | MVP selects predefined Venues; Platform Admin may provision Venues through authorized administration/seed workflow; no user Venue-request process. | Avoid unapproved moderation domain; §§22, L7. |

**Compatibility note:** The event-suspension refund rule is a newly approved exception to normal post-payment ticket issuance, not permission to change Payment/Refund FSMs. Implement it with the existing bank-evidence, idempotency and reconciliation protections. The backend must not treat an unresolved bank outcome as successful or failed by timeout.

## Reading and change control

- Each domain has one current contract. Detailed domain contracts in Parts B–H expand the corresponding numbered sections; they are not competing versions of business rules.
- Historical superseded alternatives are retained in Git history, not as executable requirements in this file.
- Explicitly OPEN or PROVISIONAL items are not authorized implementation assumptions; resolve them before the affected production implementation.
- Backend must preserve every cross-domain invariant and transaction rule, including those not expressible by PostgreSQL CHECK/FK alone.

---

# Part I --- Identity, Authentication, and Roles

## 3. User model --- FINAL

### 3.1 Role semantics

BiletFlow has five business capabilities/roles (three event-scoped elevated roles, one global administrator role, and attendee capability):

-   **ATTENDEE** --- base capabilities of every normal verified user.
-   **EVENT_ADMIN** --- elevated rights for one specific event.
-   **ORGANIZER** --- responsible organizer rights for one specific
    event.
-   **PLATFORM_ADMIN** --- global platform administration rights.
-   **EVENT_SUPPORT** --- event-scoped access to permitted event Support Cases only; not Event Admin/check-in or Organizer authority.

These capabilities are **not** stored in one global role column: attendee rights are baseline, PLATFORM_ADMIN is global, and ORGANIZER, EVENT_ADMIN and EVENT_SUPPORT are event-scoped.

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
- event_role    ORGANIZER | EVENT_ADMIN | EVENT_SUPPORT
```

An Event Admin, Event Support worker or Organizer can have different roles for different
events. One user may hold EVENT_ADMIN and EVENT_SUPPORT for the same Event; role grants are independent. Use a composite identity including event, user and role (not UNIQUE(event_id,user_id) alone). Ordinary attendees are **not** inserted into `event_user_roles`
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

- organizer agreement acceptances are in event_application_agreements (AG-01)
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

Before application submission, the applicant must separately accept (1) Organizer Rules and (2) Ticket Sales/Refund & Financial Responsibility Terms. **AG-01** replaces the former single Organizer Terms pair with the following table:

```text
event_application_agreements
- id                 UUID PK
- application_id     UUID NOT NULL FK -> event_applications
- user_id            UUID NOT NULL FK -> users
- document_type      ORGANIZER_RULES | TICKET_SALES_FINANCIAL_TERMS NOT NULL
- document_version   TEXT NOT NULL
- accepted_at        TIMESTAMPTZ NOT NULL
UNIQUE(application_id, document_type)
```

Only the applicant may accept for the application. Backend checks that both entries exist, belong to the applicant and reflect the current required versions **atomically at DRAFT -> PENDING**. Draft re-acceptance replaces the current acceptance with the newly accepted version; submitted/terminal application acceptances are immutable. Event duplication creates no copied acceptances. The canonical legal document text/version registry is maintained by the application/configuration layer; database rows preserve acceptance evidence.

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
-   Event staff invitations (EVENT_ADMIN and EVENT_SUPPORT);
-   event-scoped software staff assignments (no Staff Passes);
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
- is_suspended             BOOLEAN NOT NULL DEFAULT FALSE
- suspended_at             TIMESTAMPTZ NULL
- suspension_reason        TEXT NULL
- ga_capacity              INTEGER NULL  -- positive iff GENERAL_ADMISSION; NULL for ASSIGNED_SEATING
- purchase_terms_version   INTEGER NOT NULL DEFAULT 1 CHECK (> 0)
- published_at             TIMESTAMPTZ NULL
- cancelled_at             TIMESTAMPTZ NULL
- completed_at             TIMESTAMPTZ NULL

- created_at               TIMESTAMPTZ NOT NULL
- updated_at               TIMESTAMPTZ NOT NULL
```

Event categories and images live in their own relation tables. Suspension fields follow ADM-01 (§L4): `is_suspended=TRUE` requires `suspended_at` and a nonblank reason; suspension is not an Event lifecycle status. `ga_capacity` and `purchase_terms_version` are existing approved requirements (§§18.4, 23, B5), not new business decisions. The approved `refund_policy` storage and public contact link fields must be reconciled into final physical DDL from their domain contracts; this conceptual list is not an exhaustive executable table definition.

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

Private-event invitation logical tables and access rules are approved in Part F. `PRIVATE` remains part of the Event model; final physical DDL and integration tests are outstanding.

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

> **APPROVED architecture; integrated physical DDL pending.** Event-change decisions C01–C59 and GA-01–GA-24 apply. Backend owns final migration and concurrency tests.

## 18. Editable vs moderated event data --- CHANGED v0.3

### 18.1 Organizer-editable fields on a published Event

Subject to lifecycle, permissions, technical validation, and audit/history rules, Organizer can edit without an Event Change Request:

- description, categories (from the controlled platform list), and event images;
- visibility and public-facing contact name, email, phone, Instagram URL, Telegram URL, and website URL;
- manual sales pause/resume (not changes to configured sales-window timestamps);
- event staff assignments/invitations and promo/campaign settings within their separately approved constraints;
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
- `CREATE_TICKET_TYPE` uses `target_id IS NULL` and validated proposed values. **GA-23/24 (Part D §D1) APPROVED:** multiple create items are allowed in one request. The partial unique `(change_request_id, field) WHERE target_id IS NULL` **excludes** `CREATE_TICKET_TYPE`; non-create Event fields remain unique, and non-NULL targets retain `(change_request_id, field, target_id)` uniqueness. Each create item has its own UUID primary key; backend validates the full batch and applies it atomically.
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

For v0.1, applicants choose an existing venue. A user-facing `Request New Venue` workflow is excluded from MVP (ADM-03). Platform Admin may provision new predefined Venue records via authorized administration or seed workflow; do not expose unrestricted organizer creation.

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

Paid Sales Activation verification, payout-account, fee tables and complete FSM are defined in **Part G**. `SUSPENDED` is reserved for Platform Admin suspension of paid sales.

------------------------------------------------------------------------

# Part VI --- Admission and Event Roles — APPROVED SP-01

Event roles grant software permissions, not physical admission. Staff Passes and staff-pass scans are **excluded from MVP** and must not appear in the final MVP schema. Organizer handles physical staff badges outside BiletFlow. Event staff invitations (EVENT_ADMIN and EVENT_SUPPORT) and event-scoped check-in authorization remain required; see Part E. EVENT_SUPPORT has no check-in privilege.

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

The buyer Order total excludes Organizer-borne processing fees (Part XX). Therefore `total_minor = subtotal_minor - discount_minor` for the current MVP; fees estimated on Payment do not increase the buyer Order total. `SUM(order_items.line_subtotal_minor) = orders.subtotal_minor` and `SUM(order_items.line_discount_minor) = orders.discount_minor` are transactional backend invariants. Line discounts are nonnegative and at most line subtotals. Percentage calculation floors to one tiyn, then proportional line allocation uses deterministic remainder distribution (Part H).

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
- line_subtotal_minor BIGINT NOT NULL
- line_discount_minor BIGINT NOT NULL DEFAULT 0

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

This supports ticket issuance, seat tracking and attendee assignment. **Only full-Order refunds are in MVP**; `line_discount_minor` is a historical allocation for analytics, not permission for partial refunds.

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

Ticket logical schema and issuance rules are specified in Part E; integrated physical DDL is pending. Issuance occurs only after successful confirmation.

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

## 38. Promo code core model — APPROVED PC-01–PC-15

Every promo code belongs to exactly one Event (`event_id NOT NULL`). Global codes are excluded. Organizer can create codes only for authorized Events. `promo_codes` has no single `ticket_type_id`: selected eligible types use `promo_code_ticket_types` (composite primary key on promo code and ticket type). Promo codes may be standalone or linked to an Event-owned `promotional_campaigns` record. One campaign can have multiple promo codes, each with its own opaque Campaign QR link.

The canonical complete field, FK, index, calculation and transaction contract is in **Part H, H1–H7**. `discount_type = PERCENTAGE | FIXED_AMOUNT`; `application_scope = ORDER | SELECTED_TICKET_TYPES`. Both scopes use one eligible subtotal; fixed discount is applied once per Order, capped at eligible subtotal. Percent discount is floored to one tiyn; proportional per-item allocation has deterministic remainder handling. Orders freeze financial values and line discounts. Financial terms and eligible types of a promo are immutable after creation; `is_active` can be toggled with audit. No hard delete. See Part H for promo hold and redemption semantics.

------------------------------------------------------------------------

## 39. Promo preview vs guaranteed use — APPROVED

Entering a promo code at Ticket/Seat Selection or Checkout performs a **preview**; it does not consume a redemption or reserve capacity. The frontend keeps one shared code value between those pages; the backend is authoritative for eligibility and money.

At Order creation, backend transactionally revalidates Event scope, selected Ticket Types, active flag, validity dates, redemption capacity, Reservation and all financial rules; it atomically freezes Order/item snapshots and creates the required `promo_hold`. If the code is unavailable, no discounted Order is created. The user must confirm a new checkout calculation.

**After a valid Order + promo hold exists, do not re-require current `promo_codes.is_active`, validity date or unused global redemption capacity at Payment creation.** Revalidate the frozen Order, protected hold, Reservation, paid-sales permission and Payment eligibility instead. Disabling/expiry/exhaustion after Order creation cannot reprice the existing Order or release a bank-protected hold. New Orders are denied. See §§37,40 and Part H.

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

## 42. Paid Sales Activation — APPROVED PSA-01–PSA-09

Paid Sales Activation is per Event; absence of a `paid_sales_activations` row means computed `NOT_REQUESTED` and prohibits paid sales. Free-only events do not require activation. The activation fee is **30,000 KZT**, configured in backend (3,000,000 tiyn under the approved minor-unit convention), frozen in the activation-fee payment snapshot. The organizer must submit identity and payout-account details, accept paid-event terms, obtain manual Platform Admin approval, and successfully pay the fee through Halyk sandbox/simulation before activation becomes `ACTIVE`.

Rejected verification requests are immutable historical rows; Organizer may submit a new request after rejection. Approved payout details are immutable in MVP; change requires Support and a future approved process, not direct edit. Payment-card data entered in the Halyk widget is not stored by BiletFlow. Platform Admin alone may suspend/resume paid sales; Organizer may pause individual ticket-type sales. No repeat fee after suspension. Activation fee is not automatically refunded upon Event cancellation, subject to applicable law and platform fault obligations.

**The canonical detailed schema, FSM, provider-UNKNOWN, reconciliation, concurrency and backend contract is Part G, G1–G7, as amended by PSA-08/09 in this section.** Provider API details remain an external integration gate, not an unapproved product decision.

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

## 44. Cancellation after tickets — APPROVED; detailed schema in Part B

If tickets exist, cancellation requires Platform Admin review. Paid
purchases should be refunded; free tickets should be cancelled; affected
users should be notified; the event remains available in relevant
histories with `CANCELLED` status.

The `event_cancellation_requests` logical contract is defined in Part B; Refund request/attempt FSM and failure recovery are in Parts B and D. Notifications/Outbox has an approved logical contract in Part I; integrated executable DDL remains outstanding (§51).

------------------------------------------------------------------------

# Part XII --- Private Events and Event Staff Invitations

## 45. Private events — APPROVED PI-01–PI-04

`PRIVATE` events are not publicly discoverable. Personal email-bound invitation links provide **24-hour** access to the Event page and permission to start eligible checkout. A verified matching account is required; registration may precede access. No separate acceptance, manual revocation, or stored expiry state is required. Expiry prevents new checkout/payment initiation but does not invalidate a Payment created before expiry, a protected Reservation, or already issued Tickets. See **Part F** for canonical schema and transactional rules.

## 46. Event staff invitations — APPROVED EA-01–EA-04 / A02

Organizer invites a verified BiletFlow user by public ID into `event_staff_invitations`, selecting `EVENT_ADMIN` or `EVENT_SUPPORT`. Inbox and email point to the same invitation. Invitee may accept/decline; expired/declined/revoked invitations may be replaced under the E5 uniqueness/recovery rules. Acceptance atomically creates **only** the invited event-scoped role. Organizer may revoke that role without revoking the other role. Backend rechecks current role for Check-in or Support actions; EVENT_SUPPORT does not gain Check-in rights. See **Part E, E5**, **Part J** and **Part L2**.

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

The approved generic `audit_logs` logical schema, action catalog and immutable-write contract are in Part K. Its integrated physical DDL remains outstanding.

## 48. Tickets, Check-in and staff admission — APPROVED T-01–T-10 / SP-01

Each attendee Ticket is a unique, one-admission credential with `VALID | CHECKED_IN | CANCELLED | REFUNDED` status and separate immutable Check-in/reversal history. QR is signed, stable across ordinary Event changes, and verified online against current backend state; current PDF is generated on demand. Ticket identity/attendee snapshot and Check-in rules are specified in Part E.

**Staff Passes and staff-pass scan workflows are excluded from MVP.** Event Admin is an event-scoped software role, not a physical admission credential. Organizer handles physical staff badges outside BiletFlow.

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
7.  Organizer, Event Admin and Event Support are event-scoped roles with independent permissions.
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

## 51. Remaining architecture blocks — current status

**Approved logical contracts, NOT missing designs:** Notifications/Inbox/Outbox (Part I), Support (Part J), Audit/Event History (Part K), and Analytics definitions (Part L). Their integrated physical SQL and backend execution tests remain outstanding.

**Approved MVP scope:** ADM-02 fixes the backend-configured 30,000 KZT activation fee without Admin tariff UI; ADM-03 uses predefined Venues without user-requested Venue moderation. **Remaining implementation/production boundaries:** atomic free-checkout versus Event suspension must serialize on the Event lock; privacy/retention and provider-specific guarantees require backend/legal verification. Do not silently treat integration gates as verified.

**External/implementation gates:** exact provider-specific Halyk API, payout settlement/routing and webhook mapping; provider email capabilities; encryption/key management; integrated PostgreSQL DDL and migrations; concurrency and integration tests; full SRS traceability, legal review, operational deployment and security review. No claim of tested production SQL is made.

Refunds, Tickets/QR/PDF, Check-in, Event Staff Invitations, Private Event Invitations, Paid Sales Activation and Promotions have **approved business rules and logical design**, but final physical schema integration is still pending. Staff Passes and standalone Attendees tables are excluded from MVP by approved decisions. Assigned Seating extras beyond the approved baseline remain scope-controlled.

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
12. Check-in and Event Admin roles (no Staff Passes); Event Support roles are integrated with Support.
13. Paid Sales Activation final implementation.
14. Event staff/private invitations.
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

Version progression: v0.2 FINAL → v0.3 FINAL → v0.4 domain drafts/approvals → v0.7 INTEGRATED REVIEW → **v0.8 DDL INTEGRATION (this document)** → v1.0 after final integrated `schema.sql`, review and backend validation.

------------------------------------------------------------------------

## 54. Current architecture checkpoint

Tickets, Check-in, Refunds, Invitations, Paid Sales Activation, Promotions, Notifications, Support and Audit have approved logical contracts in this version; physical integration and remaining gates are tracked in §51 and Part L.

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
  -> Ticket Issuance / Check-in (Part E)
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

## 63. Remaining provider and implementation dependencies

Approved business/logical designs for Tickets, Check-in, Refunds, Activation and Campaign QR are included in Parts B–H. This does not imply an integrated executable production schema or verified provider behavior. The authoritative OPEN register is §51; backend execution/testing requirements remain mandatory.

---

# Part B — Event, Cancellation and Refund domain contracts (APPROVED)

> **Authority:** This Part contains approved domain rules. The corresponding numbered sections provide baseline entities; this Part supplies detailed cross-domain requirements.

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
- Replace `UNIQUE(change_request_id,field)` with partial unique `(change_request_id,field) WHERE target_id IS NULL AND field <> 'CREATE_TICKET_TYPE'` and `(change_request_id,field,target_id) WHERE target_id IS NOT NULL`. Multiple ticket types and different fields of same type can be changed in one request; duplicate field+target cannot.
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

- Separate `refund_requests` (authorization/decision) from `refunds` (individual provider attempts). Approved request does not equal succeeded money transfer. Sources include CUSTOMER, PLATFORM_ADMIN, EVENT_CANCELLATION, EVENT_CHANGED, ORGANIZER_INITIATED, EVENT_SUSPENSION (RF-01), and the previously approved system fast-refund source; reconcile exact canonical names with R37 before migration. `EVENT_SUSPENSION` is an automatically APPROVED mandatory full-Order request only after independently verified charge success without issued tickets because administrative suspension prohibits issuance; no new Refund FSM. Customer reason codes are stable identifiers (five configured UI reasons) with optional comment and required comment for OTHER. UI display text may change independently.
- Ordinary refund: Organizer alone approves/rejects; Platform Admin is not in the normal path. Request can be withdrawn before organizer decision. After 24h pending send reminder; after 48h without decision escalate to `PENDING_ADMIN`; Organizer loses decision authority for that request, Admin decides. Escalation does not auto-approve. Track objective organizer lateness in history/admin reporting; no numeric reputation score in MVP.
- Platform Admin can initiate a full refund directly, including Support disputes, subject to all financial constraints. System fast refund: within 15 min of purchase if at least 24h before Event and other eligibility requirements. Event cancellation mandatory refunds and event-change special refunds use existing Refund Service without manual organizer approval.
- Refund Service: lock Order and related Request/Refund/Payment in globally consistent order; verify approved request, succeeded matching Payment, entire paid amount from Payment (never frontend), no succeeded or unfinished conflicting Refund, valid FSM and ticket/check-in restrictions; create new attempt and durable work before provider calls. Keep financial identity fields (`order_id`, `payment_id`, `refund_request_id`, `amount_minor`) immutable; restrict DB write privileges as needed.
- Refund attempt FSM: `PENDING -> PROCESSING -> SUCCEEDED | FAILED | UNKNOWN`; UNKNOWN may resolve only from reliable provider evidence to SUCCEEDED or FAILED. No backward transitions from SUCCEEDED. Protect success and unfinished states with appropriate partial unique indexes; composite FK verifies Payment and Refund Request belong to same Order.
- Mandatory cancellation retry: at most 5 SYSTEM attempts per refund-request chain; count from existing refund rows, exclude PLATFORM_ADMIN manual attempts; retry only when previous outcome definitely FAILED and provider policy permits it, at due `next_retry_at`, using exponential backoff. UNKNOWN requires reconciliation, not a blind new attempt. On exhaustion or persistent failure escalate to admin. Retry count and creation are atomic under Event -> Order -> Request -> Refund locking (DL-01). Worker crash/restart must preserve due tasks.
- Final ticket invalidation, inventory release and financial result must follow previously approved Refunds atomicity rules. Provider-dependent status queries, safe idempotency and insufficient-funds behavior remain PROVISIONAL. An insufficient-funds provider failure must be visible to Admin, not interpreted as successful refund. No invented organizer balance/reserve; payout/settlement model with Halyk OPEN.
- Policy hierarchy: applicable law > mandatory BiletFlow rules > structured Organizer policy. Organizer may specify no additional voluntary refunds; platform/mandatory refunds and Support remain available. Policy is selected through structured application form and captured for Order. Changes after first sale require Event Change Request; new policy applies only to future Orders even if more generous. Ticket UI/PDF may show 'Подать запрос на возврат можно до ...' when a meaningful deadline exists; freshly downloaded PDF uses current display, without replacing immutable Order policy.
- Two organizer consents for each Event Application: Organizer Rules and Ticket Sales/Refund & Financial Responsibility terms; store document type/version, actor, application and acceptance time in `event_application_agreements` (AG-01), not duplicated on `event_applications`. Registration has User Agreement and privacy acceptance/acknowledgment as legally appropriate. Draft legal text deferred; do not treat checkbox as waiver of statutory rights.

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

1. Review the current architecture against the separately maintained SRS; reconcile any remaining domain-level contradictions before v1.0.
2. Validate exact enum/column/index definitions against current PostgreSQL 16 production schema, not only test tables.
3. Review global lock order and isolation level across Orders/Payments/Reservations/Tickets/Events/Refunds.
4. Build FastAPI integration tests including crash recovery, concurrent approval, bank callbacks and replay/idempotency.
5. Validate legal and banking dependencies before production paid sales.

---

# Part C — GA-01–GA-22 integration register (APPROVED, 2026-11-08)

This section is the approved GA implementation register, read together with §§23–25 and §§31–32. It is an architecture contract, not evidence of production implementation.

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
- Still requires full SRS traceability review, integrated production DDL and Refund/Payment/Check-in integration tests. Prior isolated SQL tests do not establish production readiness.

------------------------------------------------------------------------


# Part D — Refund execution and cancellation decisions (APPROVED)

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
- An authorized Organizer **may** initiate a full-Order voluntary refund even if one or more tickets were checked in; Platform Admin may do likewise. This is an explicit approved exception. Buyer-initiated ordinary refunds after effective Check-in remain prohibited. Preserve all historical Check-in records. Financial/provider/conflict checks still apply (Part E §E4).
- Check-in validation and refund approval must serialize safely; neither may pass a stale pre-lock check.

## D4. CR-07–CR-10 — ticket access during refund

- On `refund_request = APPROVED`, immediately deny new Check-in for affected Order tickets, without prematurely marking them `REFUNDED`.
- During unfinished/UNKNOWN provider operations, continue denying Check-in; UNKNOWN requires reconciliation.
- Only confirmed `Refund = SUCCEEDED` causes final ticket `REFUNDED` state.
- For `ORGANIZER_INITIATED` only: after the **entire** voluntary refund procedure is conclusively unsuccessful (not merely one FAILED attempt), and no unresolved provider operation or late success remains possible, automatically remove the temporary Check-in block if Event and Ticket remain otherwise eligible. Notify buyer and Organizer.
- For mandatory event cancellation and other mandatory refund obligations, never automatically restore ticket validity merely because a provider attempt failed; escalate according to existing rules.
- Keep Refund Request `APPROVED` as historical authorization even when the voluntary procedure ends `FAILED_FINAL`. The authoritative execution result is `refund_requests.execution_status` (CR-15, D6), supported by Refund attempts and provider evidence. Check-in blocking is derived from execution status plus all other applicable Order/Event restrictions, not from authorization status alone. UNKNOWN or unresolved provider work never becomes `FAILED_FINAL` by timeout.
- The approved `FAILED_FINAL` eligibility and recovery contract is in D6 (CR-15/16); the provider-specific evidence of finality and race-safe dispatch/reconciliation must be verified in backend integration before production. This is an external implementation gate, not an unapproved business decision.

## D5. CR-11/12 — reinitiating voluntary refund

- After conclusive final failure of a previous `ORGANIZER_INITIATED` chain, Organizer may create a new Refund Request for the same Order, retaining prior history.
- Reject new requests if any successful, pending, processing or UNKNOWN refund exists; recheck source-specific Check-in rules and financial eligibility transactionally.
- The five SYSTEM-attempt limit applies to the previously approved mandatory automatic retry scenario, **not** to the number of separate Organizer-initiated requests. Enforce rate limiting and provider-safe idempotency.

## D6. Subsequent approved decisions and external OPEN dependencies

- CR-13 is APPROVED by subsequent decision: Organizer-initiated full-Order refund **is permitted after Event `COMPLETED`**, subject to financial, authorization, provider and source-specific Check-in rules (Organizer/Admin exception for used tickets). The earlier OPEN question is superseded.
- Reconcile all new refund-source values and approval/attempt eligibility with the exact final Refund FSM and provider constraints.
- Bank settlement, payout/reserve and insufficient-organizer-funds handling remain provider-dependent/OPEN. Do not invent organizer balance or bank guarantees.

## D6A. Refund procedure completion — CR-14, CR-15A/B, CR-16 (APPROVED; physical DDL pending)

**Scope:** These approved rules define refund-procedure finality without changing the mandatory SYSTEM retry policy. The fields below are the logical design contract for the eventual integrated schema, **not** a claim of tested migration or verified bank behavior.

- **CR-14:** An Organizer-initiated refund authorized before the Event becomes `COMPLETED` continues through provider processing and reconciliation after completion. Event completion alone never cancels or reverses an already authorized refund. This is consistent with CR-13 allowing new eligible Organizer-initiated requests after completion.
- **CR-15 procedure FSM:** Keep `refund_requests.status` (authorization decision) distinct from `refund_requests.execution_status` (execution). Proposed `execution_status`: `NULL` before approval; `NOT_STARTED` on approval; `IN_PROGRESS` when a provider attempt is durably initiated; `SUCCEEDED` on confirmed financial success; `FAILED_FINAL` only after conclusive non-success of the entire procedure. Terminal execution statuses are immutable through ordinary operations. `execution_finalized_at TIMESTAMPTZ NULL` is required only for `SUCCEEDED`/`FAILED_FINAL`. The earlier proposal for a separate `execution_finalization_reason` ENUM is **not adopted**; evidence/reason must be retained in an appropriate immutable audit/provider-operation journal.
- **CR-15A:** For `source=ORGANIZER_INITIATED`, **at most one historical `refunds` attempt per `refund_request`**, including FAILED attempts. No automatic new financial attempt within that request. Status polling and safe recovery of the *same* provider operation do not count as another attempt. After `FAILED_FINAL`, Organizer may create a **new** request under CR-11/12 eligibility and full-Order conflict checks. The existing five-attempt cap applies only to approved mandatory automatic SYSTEM attempts, not Organizer-initiated requests or Platform Admin manual attempts.
- **CR-15B / provider finality:** A timeout, HTTP failure, missing response, unverified callback, or inconclusive/UNKNOWN status never proves bank failure. Keep execution `IN_PROGRESS`, block affected Check-in, reconcile the original operation, and escalate prolonged uncertainty to Platform Admin. No administrative override may mark `FAILED_FINAL` without conclusive evidence. Verified provider callback, authoritative operation response, or documented status query may supply evidence **only to the extent the actual provider contract guarantees finality**. Halyk refund status/idempotency/settlement semantics remain PROVISIONAL until verified by backend integration.
- **CR-16:** `NOT_STARTED -> FAILED_FINAL` is allowed without a `refunds` attempt only if there is durable evidence that no bank operation was submitted/accepted and this procedure cannot execute; transient pre-send errors are not sufficient. `IN_PROGRESS -> FAILED_FINAL` requires conclusive failed outcome for all attempts and absence of pending sends, retries, UNKNOWN results, and late-success uncertainty. `IN_PROGRESS -> SUCCEEDED` requires verified provider success. `NOT_STARTED -> IN_PROGRESS` occurs only with a durable attempt and dispatch intent; no external bank call inside the database transaction.
- **Check-in:** An APPROVED refund blocks affected Order tickets immediately while `NOT_STARTED` or `IN_PROGRESS`. Only confirmed successful refund makes tickets `REFUNDED`. For `ORGANIZER_INITIATED`, `FAILED_FINAL` removes *this request's* temporary block, but Check-in still checks Event/Ticket state and every other blocking obligation. Mandatory refunds never automatically restore access on provider failure. Check-in and refund authorization/finalization must serialize so no stale check permits entry during a refund.
- **History as source of truth:** Derive automatic SYSTEM attempt count from historical `refunds` rows filtered by the approved SYSTEM actor/attempt classification; do not add a redundant retry counter. Where Event is involved, acquire Event first, then Order, Request and attempt locks according to DL-01 before count-and-insert; enforce cross-request successful/unfinished refund exclusion. PostgreSQL `CHECK` alone cannot enforce these cross-row/time/provider invariants. The DB and backend must both guard the one-attempt Organizer rule; any trigger must serialize on the parent Order/Request rather than perform an unsafe unprotected COUNT.
- **Operational recovery:** Persist provider-operation identity and durable dispatch/reconciliation work. Finalization must exclude queued/in-flight sends, not merely check current Refund status. A contradictory late bank success after supposed final failure is a financial incident requiring evidence retention, conflict protection, reconciliation, and explicit remediation; do not silently issue tickets or initiate another financial operation.

### Backend delivery / testing responsibility (not performed during architecture design)

The backend team owns PostgreSQL execution, migrations, two-session concurrency tests, payment-provider sandbox mapping, webhook authenticity, retry/reconciliation worker crash recovery, and end-to-end Refund/Check-in integration tests. The final deliverable must include a consolidated `schema.sql` that creates the complete PostgreSQL database plus `database.md`; SQL design review is not a substitute for runtime testing. The standalone Refunds SQL drafts are **non-authoritative integration candidates** until aligned with actual Orders/Payments and other domain tables. Do not label them production-ready or tested.

### Explicit remaining technical gates

1. Reconcile physical enum/column names with existing Refund R37/R38, Payment and Order models; avoid duplicating or weakening older approved constraints.
2. Specify provider-operation evidence and dispatch state such that `FAILED_FINAL` is race-safe against a bank call already in flight; ordinary row locks alone do not retract HTTP requests.
3. Verify the one-attempt Organizer rule and five SYSTEM-attempt limit cover the intended actor/source combinations, including manual Admin intervention and all mandatory refund sources.
4. Implement refund-request and refund-attempt FSM guards, immutable financial identity, consistent cross-table Order membership, and idempotent terminal processing.
5. Confirm provider finality semantics with actual Halyk documentation/sandbox; no assumed guarantee is approved here.

## D7. Evidence and limitations

- PostgreSQL C57/C58 tests were performed on isolated `test_c57_*` and `test_c58_*` tables: FK membership, uniqueness, CHECK, rollback/atomicity, sequential idempotency, and two-session approval/withdrawal races. Recovery-action SQL classification was exercised, **not** the actual background worker.
- The draft retains historical v0.2 sections and addenda; a clean, fully reconciled canonical document, production DDL, migrations, integration tests and complete SRS traceability are **not finished**.
- DOC-09: this current version is the single normative architecture SoT. Previous v0.2/v0.3/v0.4 drafts and isolated test evidence are historical references, not separate authoritative implementation instructions.


---

# Part E — Tickets, Check-in, Roles and Global Locking (APPROVED)

## E1. Ticket issuance and attendee identity — T-01–T-04 (APPROVED)

- Each actual admission ticket is a distinct immutable-history `tickets` row, including when a GA `order_items.quantity > 1`. Every Ticket links to exactly one Order Item; one Assigned Seating Order Item corresponds to one Ticket. Backend enforces exactly `order_items.quantity` issued tickets per confirmed Order Item, including idempotent retries and recovery.
- **No `item_sequence` column is required by the approved MVP design.** Ticket issuance must be performed in the same short PostgreSQL transaction that confirms the Order and converts the Reservation. Lock the relevant Event/Order/Reservation and inventory as required by DL-01; create the complete set of Ticket rows, never a committed partial set. On retry, re-read Order state and existing Tickets under locks and return the existing result; do not issue additional tickets. A bare count check outside a transaction is prohibited. Backend team must test crash/retry and concurrent callbacks.
- Store `tickets.attendee_name TEXT NOT NULL` as a ticket-specific historical snapshot. At checkout, default each ticket's attendee name to the buyer's profile name unless a separate name was provided for that ticket. The attendee need not be a BiletFlow user; the buyer retains Order ownership. Do not mutate `profiles.full_name` to assign ticket names. Once issued, attendee name is immutable through ordinary interfaces.
- No separate `attendees` table in MVP. Attendee lists and searches are derived from Tickets joined to Orders/Events. This supersedes older 'attendees schema pending' instructions as an MVP requirement.
- Assigned Seating: persist section/row/seat labels as historical snapshots on both `order_items` and `tickets` (nullable for GA); retain event-seat relationship for ownership/availability and enforce consistency when freezing Order and issuing Ticket. The final physical DDL must distinguish GA and Assigned Seating and prevent cross-Event references.

## E2. Ticket status, QR and PDF — T-05–T-07 (APPROVED)

- Ticket statuses: `VALID | CHECKED_IN | CANCELLED | REFUNDED`. Temporary Refund/Order/Event admission restrictions are computed eligibility checks, not extra Ticket statuses. Only confirmed financial Refund success marks affected Tickets `REFUNDED`; ordinary cancellation uses `CANCELLED`. Preserve issuance and entry history permanently for normal business operations.
- Every Ticket has a stable unique identifier and stable tamper-resistant QR payload signed with HMAC-SHA256 using a server-held secret, with a key identifier/version for controlled key rotation. QR must contain no attendee PII and must be distinguishable from Campaign QR. Backend verifies signature, current Ticket/Event state, effective Refund blocks, and scan permissions online; QR possession alone does not bypass those checks. Keep old verification keys for still-valid tickets during rotation; define a safe key-retirement process before implementation.
- Ordinary event date/time/venue updates do not change Ticket identity or QR. Previously downloaded/printed PDFs are not auto-updated; buyer is responsible for re-downloading to obtain current event details. My Tickets and every fresh PDF download use authoritative current event/ticket data, while immutable purchased-seat snapshots remain historical. A stale PDF QR may still be accepted if the underlying Ticket remains eligible. Cancellation/refund/check-in invalidate admission server-side regardless of printed copy.
- Generate print-ready PDFs on demand from authoritative records; no dedicated PDF storage table required for MVP. Same ticket ID/QR in web and PDF. Do not embed payment-card data, secrets or unnecessary PII. Access to PDF/download and My Tickets must be authorized by Order ownership or approved administrative access.

## E3. Check-in history and access — T-08–T-10 (APPROVED)

Conceptual schema (physical types, FK indexes and CHECK combinations to be reconciled in final DDL):

```text
check_in_records
- id               UUID PK
- ticket_id        UUID NOT NULL FK -> tickets
- checked_in_by    UUID NOT NULL FK -> users
- checked_in_at    TIMESTAMPTZ NOT NULL
- reversed_at      TIMESTAMPTZ NULL
- reversed_by      UUID NULL FK -> users
- reversal_reason  TEXT NULL
```

- Partial UNIQUE on `check_in_records(ticket_id) WHERE reversed_at IS NULL` prevents two effective admissions. A successful check-in atomically creates the record and changes Ticket `VALID -> CHECKED_IN`. An authorized reversal annotates that record, preserving history, and may restore Ticket `VALID` only when no other eligibility block applies. A subsequent valid scan creates a new history row. Reversal requires a non-empty reason and audit; repeated reversal is idempotent or rejected without mutation.
- `EVENT_ADMIN` for assigned Event and its `ORGANIZER` may check in and reverse; `PLATFORM_ADMIN` may perform audited administrative reversal. `ATTENDEE` may not. Backend checks current event-scoped role from DB, not a stale JWT role claim, and serializes permission check with concurrent role revocation.
- Check-in is eligible from Event `PUBLISHED` onward without an opening-door timestamp. It is denied for `DRAFT`, `CANCELLED`, `COMPLETED`, for Ticket other than `VALID`, for effective refund blocks, or at/after `events.ends_at` even if the completion worker has not yet updated stored status. Backend must revalidate time and state after required locks; authorization and scan success are one transaction.
- Cancellation or refund never erases a historical successful scan. If an already checked-in Ticket later receives an exceptional authorized full-Order refund, its financial outcome becomes `REFUNDED` while the immutable check-in history still proves past attendance. Effective admission cannot be regained merely by refund failure for mandatory obligations.

## E4. Used-ticket refund exception — subsequent APPROVED amendment to CR-01/05 and T-07

- A customer cannot obtain an ordinary self-service refund after any Ticket in the Order has an effective Check-in, except where mandatory law/platform obligations require separate handling.
- Authorized `ORGANIZER_INITIATED` and `PLATFORM_ADMIN` **full-Order** refunds may be approved even if one or more Tickets have effective Check-in, including after Event `COMPLETED`, subject to all previously approved financial eligibility, provider finality, conflict prevention and audit rules. The same Organizer/Admin exception is defined in Part D §D3 and §D6. No partial refund is introduced.
- Check-in history is never erased or reclassified as a reversal to make such refund possible. On confirmed Refund success, Tickets become `REFUNDED` and future admission is denied. While the refund is approved/unfinished, new Check-in is blocked under CR-15; historical scans remain intact. Refund and check-in must serialize on the same Order/Event locks so the outcome cannot depend on stale pre-lock checks.

## E5. Event staff invitations — EA-01–EA-04 extended by owner-approved A02

```text
event_staff_invitations
- id                 UUID PK
- event_id           UUID NOT NULL FK -> events
- invited_user_id    UUID NOT NULL FK -> users
- invited_by_user_id UUID NOT NULL FK -> users
- invited_role      EVENT_ADMIN | EVENT_SUPPORT NOT NULL
- status             PENDING | ACCEPTED | DECLINED | REVOKED NOT NULL
- expires_at         TIMESTAMPTZ NOT NULL
- created_at         TIMESTAMPTZ NOT NULL
- accepted_at        TIMESTAMPTZ NULL
- declined_at        TIMESTAMPTZ NULL
- revoked_at         TIMESTAMPTZ NULL
```

- Organizer invites an existing verified user using public `users.public_id`, never exposing private email search or using public ID as a relational FK. Inbox and email reference the same Invitation. `EXPIRED` is derived from `PENDING AND expires_at <= current database time`; do not add a stored EXPIRED status merely for indexing.
- Only one currently effective PENDING invitation per Event/invited user/**invited role**; a declined, revoked or expired invitation may be followed by a new historical row. Do not create a new invitation for a role the user already actively holds; holding the other staff role is permitted. Invitation creation serializes under Event lock and checks existing rows after locking; a time-dependent partial UNIQUE predicate cannot directly enforce expiry. Add a suitable database integrity backstop for competing writes where feasible, and document all required backend checks.
- Acceptance: lock Event then Invitation; verify authenticated invitee, effective PENDING/unexpired at current DB clock after lock, Event not CANCELLED/COMPLETED, and no existing **invited role**; atomically insert `event_user_roles` with the invitation's `invited_role` and mark Invitation ACCEPTED with timestamp/audit. Repeat acceptance must not duplicate role or history. No new invitations/role assignments after Event CANCELLED/COMPLETED.
- Organizer can revoke the invited EVENT_ADMIN or EVENT_SUPPORT role before Event completion. Revoking EVENT_SUPPORT must atomically release unfinished assigned Support Cases under the Support contract; revoking EVENT_ADMIN does not revoke EVENT_SUPPORT. Role is removed from active assignments, but invitation/assignment history and prior scans remain auditable. Re-invitation after revocation is allowed. Backend must check current role on every protected scan/reversal and coordinate this with role revocation to prevent stale permission races. Existing access JWT does not confer irrevocable event authority.

## E6. Staff Passes excluded — SP-01 (APPROVED)

- Staff Passes are **OUT OF MVP** and must not be implemented or included in final MVP `schema.sql`: no `staff_passes`, `staff_pass_scans`, staff QR, or staff admission workflow. Organizer manages physical staff badges/access independently. `EVENT_ADMIN` remains an event-scoped software permission, not an admission credential. All MVP tables and endpoints must exclude Staff Passes.

## E7. DL-01 — Global transaction locking / deadlock prevention (APPROVED strategy; implementation contract)

- Use short PostgreSQL row-locking transactions and a consistent global acquisition order. **Event is the outermost shared lock** for transactions that affect Event lifecycle, inventory, issuance, refund eligibility or check-in. Obtain required identifiers by nonlocking lookup first; after locking, revalidate membership and all state. Never acquire Event lock while already holding an Order, Ticket, Payment or Refund lock.
- **Canonical conceptual order for participating operations:** `Event -> Event Change/Cancellation Request (only when required) -> inventory configuration rows (Ticket Types / Event Seats, deterministic UUID order when both needed) -> Promo Code (if hold/toggle is involved) -> Order -> Reservation -> Payment -> Refund Request -> Refund -> Ticket -> Check-in Record`. Promo Code is placed before Order so simultaneous promo disable/hold creation cannot acquire these two locks in opposite orders. If an operation needs an existing Order to identify its promo, first read IDs without holding row locks, then acquire locks in this order and revalidate. Operations lock only required rows, not every table. Event Change/Cancellation Request rows must never be acquired after holding Inventory/Order rows; their position is immediately after Event when the operation needs them. This ordering replaces inconsistent older local order descriptions; final backend implementation must inspect actual FK/trigger lock acquisition and not introduce reverse parent locks.
- Creation of a Reservation may have no Order yet; lock Event then required inventory. A Payment webhook/reconciliation that starts from Payment ID must first resolve Order/Event IDs without holding row locks, then lock in canonical order and revalidate the Payment association. Refund/Check-in paths similarly resolve Ticket -> Order -> Event identifiers before taking locks. For multiple Orders/Tickets/Seats, lock within each class in deterministic UUID order.
- **Critical rule:** the Event lock serializes all affected Event-level decisions; do not add a second lock on Event after holding a child row. Transactions changing inventory and issuing tickets must use the same Event/inventory serialization discipline, including first-ever-ticket issuance and seat configuration changes. Avoid taking locks on unrelated Events for ordinary checkout.
- Check-in and refund approval use the same Event -> Order prefix. Role revocation and scan authorization serialize via Event lock and current event-role membership recheck. Event Cancellation atomically changes Event state and durable recovery intent, then processes Orders in separate bounded Event-first transactions; do not lock the entire event's Order set in one long transaction.
- No bank HTTP requests, email, PDF generation or object-storage calls while holding database row locks. Provider dispatch uses committed durable intent, idempotency and reconciliation. After any lock wait, recheck actual current database time (`clock_timestamp()` where required, including Reservation expiry/AUTH) and statuses. Do not use stale pre-lock snapshots for eligibility.
- Handle PostgreSQL SQLSTATE `40P01` and `40001` with bounded retries of the **entire local database transaction**, including fresh eligibility checks. Never blindly repeat a financial provider operation because of a DB retry. FK and trigger side effects can still deadlock; backend team must run concurrency tests and verify actual SQL lock order. This strategy minimizes risk, not an absolute guarantee of zero deadlocks.

## E8. Backend handoff and integration gates

1. Finalize exact `tickets`, `order_items`, `event_staff_invitations`, `check_in_records` physical DDL, constraints, indices, composite Event/Order ownership checks, and Ticket FSM transition guards in the final consolidated `schema.sql`. The sketches in Part E are logical contracts, not executable DDL.
2. Ticket issuance must commit as a complete set with Order confirmation and Reservation conversion. Under approved no-sequence design, DB alone does not enforce `COUNT(tickets for order_item) = quantity`; backend owns this invariant and must test duplicate callbacks, concurrency, rollback and crash recovery.
3. Preserve assigned-seat snapshots; keep check-in and ticket-status changes atomic; test concurrent scans, scan-vs-refund, role-revoke-vs-scan, cancellation-vs-scan, and time-boundary cases.
4. Reconcile Part D refund rules with E4 used-ticket exception. Ensure a terminal refunded Ticket can coexist with historical non-reversed Check-in records; no DB CHECK or trigger may erroneously forbid this historical combination.
5. Verify signed QR format/key rotation, authentication and current-state checks, and generation of fresh PDFs; no requirement to keep historical PDF blobs.
6. Staff Passes are excluded from MVP DDL. Preserve Event Staff Invitations and independent EVENT_ADMIN/EVENT_SUPPORT roles. Backend team owns PostgreSQL execution, migration/concurrency tests and provider sandbox integration. No SQL runtime testing is claimed by this checkpoint.


---

# Part F — Private Event Invitations (APPROVED; physical DDL pending)

> **Supersession.** This section replaces historical §45's statement that private invitation design is pending. It does not modify Event Staff Invitations (Part E), nor imply that integrated SQL has been executed. The invitation grants time-limited **event-page/checkout access**, not an admission credential, and does not override existing ticket-holder access to their own orders/tickets.

## F1. Approved product behavior — PI-01 / PI-03 / PI-04

- `PRIVATE` events are excluded from public discovery. Organizer sends an invitation to a specific email address. A random, unguessable invitation link may be forwarded, but forwarding alone cannot grant access: backend requires an authenticated account whose **verified canonical email** equals the invitation email. An unregistered invitee may register and verify that email before using the invitation. No separate invitation acceptance click or `ACCEPTED` state is required.
- Invitation lifetime is **24 hours from creation** (`expires_at = created_at + interval '24 hours'`). While valid, the intended user may view the private Event and create reservations, orders, and eligible payments under normal inventory/sales rules. Expiry removes private-event browsing and permission to start further purchases. It is checked using current PostgreSQL time **after necessary locks**, not frontend clock or click time.
- A paid `Payment` successfully created before expiry may safely complete after expiry under existing AUTH/CAPTURE/CANCEL, reservation protection, stale purchase terms and reconciliation rules. A failed attempt after expiry cannot be replaced by a new Payment. An `UNKNOWN` result remains unresolved until bank evidence establishes the outcome; expiry never releases `PROTECTED` inventory or forces a financial failure. The mere existence of a pre-expiry Reservation or Order does **not** authorize a new Payment after expiry. For free/zero-total checkout, final confirmation must pass invitation-deadline validation before the deadline; do not issue Tickets for a newly confirmed free Order after expiry.
- The time boundary is defined by **backend admission of the operation**, not the time a browser button was clicked. Serialize invitation authorization and Payment creation against the relevant Event/Order transaction; revalidate the invitation against `clock_timestamp()` after locks. A payment created before expiry must not be invalidated solely by subsequent invitation expiry. Existing ticket issuance eligibility and event cancellation/terms checks still apply.
- Issued Tickets remain in `My Tickets` and their PDFs remain downloadable by their legitimate buyer after invitation expiry; event/order historical access follows existing permissions. Invitation expiry never cancels a confirmed Order or already issued Ticket. The private invitation itself does not issue Tickets, grant Event Admin rights, or guarantee availability.
- Organizer **cannot manually revoke** private invitations in MVP (PI-04 OUT OF SCOPE); no `REVOKED` status, revoke endpoint, or manual revocation UI. No stored `EXPIRED` status is needed. No acceptance status is needed either. If organizer wants to grant a fresh period, a new invitation record may be created; do not extend or rewrite historical `created_at`/`expires_at`.

## F2. Promo codes and invited guests — PI-02

- An invited user purchases or registers through the normal checkout. Organizer may separately provide a 100% discount promo code or any other valid promotion. Promo is **not** a private-event access credential. Organizer decides whether to create per-recipient codes (e.g., limit 1) or a shared code with a campaign redemption limit; no mandatory binding of promo to invitee is introduced.
- Percentage discounts up to and including 100% are permitted. A server-calculated zero-total Order confirms without creating a Payment, atomically consumes the applicable promo hold/redemption and issues normal Tickets, subject to all normal checkout, invitation, inventory, paid-sales-activation and eligibility requirements. Promo redemption limits count successful redemptions/orders, not automatically number of Tickets, unless a separately approved campaign rule says otherwise. Preserve discount/campaign attribution in historical Order data.

## F3. `private_event_invitations` — proposed minimal logical schema (not final DDL)

```text
private_event_invitations
- id                  UUID PK
- event_id            UUID NOT NULL FK -> events
- invited_email       CITEXT NOT NULL
- invited_by_user_id  UUID NOT NULL FK -> users
- token_hash          TEXT UNIQUE NOT NULL
- created_at          TIMESTAMPTZ NOT NULL
- expires_at          TIMESTAMPTZ NOT NULL
```

- Do not store raw bearer invitation tokens in PostgreSQL; use a cryptographically secure random token and hash. `invited_user_id` is **not required** for MVP: after verified registration, lookup by canonical verified email plus valid token suffices, and avoids a second identity source. Whether to add a nullable linked user for audit/performance is an implementation-level optimization only, not a separate access authority.
- Backend validates Organizer authority, that the invitation's Event is PRIVATE and eligible for invitation, verified-email equality, and nonexpired lifetime. Invitations must not silently authorize an unrelated Event. Restrict invitation lookup, protect token hashes and rate-limit token guessing. The link must not bypass normal login and email verification.
- For a private Event, reservation/order/payment creation must use server-side authorization derived from a valid invitation. An invitation token alone does not permit payment or purchase by a different verified user. If a user has multiple valid invitations, one valid matching record suffices; old expired invitations remain historical.
- The original approved PI-01 sketch contained `status = PENDING | ACCEPTED | REVOKED | DECLINED`, `accepted_at`, `invited_user_id`; **these are superseded** by PI-03's no-acceptance flow and PI-04's no-revocation MVP scope. No status enum is necessary for this domain.

## F4. Concurrency and backend responsibility (mandatory)

1. Use DL-01 Event-first locking discipline for new Reservation/Order/Payment authorization; obtain identifying references without holding conflicting child locks and revalidate after acquiring required locks. The invitation's 24-hour deadline and its email/Event ownership must be checked atomically with the relevant permission decision. A pre-check outside the transaction is insufficient.
2. For Payment creation, the successful database commit establishing a valid Payment is the eligibility boundary. Backend must not rely on the browser click timestamp; payment provider calls occur **after** the DB transaction commits. If the request arrives before expiry but cannot obtain required locks until afterward, it must be rejected.
3. Webhooks/reconciliation must not recheck the expired invitation as a reason to reject an otherwise timely Payment; they must still validate Order, Reservation, Event status, terms version, and all bank outcomes. In-flight financial operations follow the existing provider-safe cancellation/reconciliation contract.
4. Private Event browsing must not leak event details through catalog/search, unauthenticated APIs, cached responses or direct slug routes. Enforce authorization on backend read endpoints; cache must vary by authorization or be disabled for private data. Buyer access to existing Order/Ticket history is a separate explicit exception, not an invitation renewal.
5. SRS alignment: §4.2 requires private events; §4.6–4.7 requires checkout and tickets; §4.14 supports promo campaigns. The email-bound 24-hour invitation mechanism and absence of revocation are **approved BiletFlow product decisions**, not explicit SRS mandates.
6. Backend team owns PostgreSQL execution and concurrency testing; final `schema.sql` must include this table, constraints and indexes. Do not claim that this conceptual design has been runtime tested.

## F5. Integration caveat to resolve in final canonical v1.0

- Historical `PUBLISHED`/`PRIVATE` visibility changes, payment creation timing and free checkout must use one coherent authorization service. The initial PI-03 formulation 'expires after 24 hours' must not accidentally revoke already issued tickets or force cancellation of an in-flight bank operation. Existing Order/ticket holder access survives invitation expiry, but whether a buyer with expired invitation can reopen the full private event page (as distinct from their ticket/order details) remains **not granted** by PI-03: deny ordinary private-event browsing unless a fresh valid invitation exists.
- Full SQL physical DDL, index choice and interaction with final Refund/Payment FSM remain pending consolidated schema review; do not invent new bank guarantees.


---

# Part G — Paid Sales Activation: implementation contract (PSA-01–PSA-09)

**Status:** APPROVED product decisions; architecture specification for backend handoff. **v0.3 FINAL approved iteration; PostgreSQL execution, provider verification and integration testing belong to backend team.** Part G is the detailed contract referenced by §42. It does not supersede the v0.2 buyer Payment DMS, Event cancellation, or financial reconciliation rules.

## G1. Boundaries and invariant definitions

- Activation is **per Event**. An Event without `paid_sales_activations` is computed `NOT_REQUESTED`, and is not eligible for paid sales. Do not insert empty activation rows for free-only Events.
- Free-ticket checkout is independent of Paid Sales Activation. An Event with any configured PAID Ticket Type cannot be published unless activation is `ACTIVE`, under the existing publication rule. A later paid-type addition to a published Event follows Event Change Request and activation requirements.
- One responsible Organizer submits verification requests. Only Platform Admin approves/rejects verification and suspends/resumes paid sales. Organizer controls individual Ticket Type `sales_status` only; this never overrides suspension.
- The fee is one-time **per Event**. A successful fee payment must never be charged again due to retry, suspension, resumption, or cancellation. Cancellation does not trigger an automatic activation-fee refund (PSA-07), subject to applicable law and platform liability; attendee ticket refunds are separate.
- Payment card data entered in Halyk's hosted widget is never stored by BiletFlow (no PAN/CVV/card secrets). **Payout account data is distinct**: it describes the recipient of potential organizer proceeds, not the card used to pay the fee. No real-money organizer payouts are required in the academic MVP; do not imply the sandbox routes real funds.
- Verified payout details are immutable after approval (PSA-06). Support may receive a change request, but automatic account replacement is out of MVP; neither Organizer nor Platform Admin may silently edit the approved snapshot. A later product workflow would require explicit new architecture and approval.
- Activation status is **not** Event lifecycle. Event `CANCELLED`/`COMPLETED` blocks new activation/payment operations regardless of a stale `ACTIVE` activation row. Historical rows remain intact.

## G2. Logical PostgreSQL schema and ownership

All IDs UUID; timestamps `TIMESTAMPTZ`; amounts integer minor units (`BIGINT`); enforce KZT convention consistently. Enumerated status columns must be `NOT NULL` with bounded values. Exact physical ENUM vs CHECK is an implementation choice only if equivalent.

### G2.1 `paid_sales_activations` — one current aggregate per Event

```text
id                     UUID PK
event_id               UUID NOT NULL UNIQUE FK -> events(id)
status                 PENDING_VERIFICATION | FEE_PENDING | ACTIVE | SUSPENDED NOT NULL
approved_request_id    UUID NULL
approved_payout_id     UUID NULL
fee_amount_minor       BIGINT NULL CHECK (fee_amount_minor > 0)
fee_currency           TEXT NOT NULL DEFAULT 'KZT' CHECK (fee_currency = 'KZT')
paid_terms_version     TEXT NULL
paid_terms_accepted_at TIMESTAMPTZ NULL
activated_at           TIMESTAMPTZ NULL
suspended_at           TIMESTAMPTZ NULL
created_at             TIMESTAMPTZ NOT NULL
updated_at             TIMESTAMPTZ NOT NULL
```

- The absence of a row means `NOT_REQUESTED`. There is **no persisted** `NOT_REQUESTED`, `REJECTED` or `CANCELLED` activation state. Rejection belongs to the request; cancellation belongs to Event.
- `approved_request_id` and `approved_payout_id` must refer to the **same approved submission and Event**. Use redundant composite unique keys / composite FKs where feasible and a transactional backend validation for status and ownership; a single-column FK alone is insufficient.
- In `PENDING_VERIFICATION`, approved fields and frozen fee amount must be NULL. In `FEE_PENDING`, `ACTIVE`, `SUSPENDED`, approved request/payout, positive frozen fee and accepted paid terms must be present. `activated_at` must be non-NULL only for `ACTIVE`/`SUSPENDED`, and once set is immutable. `suspended_at` is the timestamp of the current suspension; clear it on resumption while preserving history in audit.
- A DB CHECK may enforce row-local presence combinations; cross-table approval and successful payment checks require backend transaction logic. Do not assume a CHECK can query other tables.

### G2.2 `paid_sales_activation_requests` — immutable submitted review history

```text
id                      UUID PK
activation_id           UUID NOT NULL FK -> paid_sales_activations(id)
submitted_by_user_id    UUID NOT NULL FK -> users(id)
payout_account_id       UUID NOT NULL FK -> payout_accounts(id)
status                  PENDING | APPROVED | REJECTED NOT NULL
verification_snapshot   JSONB NOT NULL
terms_version           TEXT NOT NULL
terms_accepted_at       TIMESTAMPTZ NOT NULL
submitted_at            TIMESTAMPTZ NOT NULL
reviewed_by_user_id     UUID NULL FK -> users(id)
reviewed_at             TIMESTAMPTZ NULL
rejection_reason        TEXT NULL
```

- `UNIQUE (activation_id) WHERE status = 'PENDING'`. Approved/rejected submissions are historical, never overwritten. A new submission is allowed only after rejection and while the parent remains eligible for verification; no second pending review.
- `PENDING`: no reviewer/time/rejection reason. `APPROVED`: reviewer/time required and rejection reason NULL. `REJECTED`: reviewer/time and nonblank reason required. CHECK for these combinations; backend enforces transitions and authorization.
- Verify that submitter is the responsible Organizer for the Event and the payout account belongs to that Organizer; store a validated, bounded immutable snapshot of what was reviewed. Admin cannot approve their own request if an existing global self-approval policy applies; no new exception is implied here.
- A retry of the same submission/decision operation must not create a second request or apply the decision twice. A distinct resubmission after REJECTED is a new row.

### G2.3 `payout_accounts` — approved payout identity, not payment cards

```text
id                           UUID PK
owner_user_id                UUID NOT NULL FK -> users(id)
owner_type                   INDIVIDUAL | LEGAL_ENTITY NOT NULL
owner_name                   TEXT NOT NULL
identifier_encrypted         BYTEA NOT NULL  -- IIN/BIN, application-level encryption
responsible_person_name      TEXT NOT NULL
contact_email                CITEXT NOT NULL
contact_phone                TEXT NOT NULL
iban_encrypted               BYTEA NOT NULL  -- application-level encryption
bank_name                    TEXT NOT NULL
account_holder_name          TEXT NOT NULL
created_at                   TIMESTAMPTZ NOT NULL
```

- **Approved MVP field set (PSA-09):** individual/legal entity identity, IIN/BIN, responsible contact, email/phone, IBAN, bank and account-holder name, as listed above. For `INDIVIDUAL`, `owner_name` is the individual's name; for `LEGAL_ENTITY`, it is the registered legal name. `responsible_person_name` identifies the contact person. Validate required fields and applicable IIN/BIN and Kazakhstan IBAN format/check digits before submission. Format checks are NOT proof of legal identity or bank-account ownership.
- **Protection:** `identifier_encrypted` and `iban_encrypted` are application-encrypted bytes; encryption keys must be kept outside PostgreSQL. Do not log raw identifiers or expose them in ordinary Event APIs. The physical encryption envelope, key rotation and any provider token mapping are implementation/integration details, not permission to omit these approved fields. Real KYC/KYB, payout routing and Halyk settlement guarantees remain OPEN external dependencies.
- Treat a submitted payout record as an immutable version. A rejected request may reference an earlier immutable version; resubmission uses a **new** record if data changes. `UPDATE` to approved payout data is forbidden by backend authorization and DB write privileges/immutability controls. Never expose sensitive data to ordinary event APIs or logs.
- Approved request links to precisely the immutable payout version that Platform Admin reviewed. Future replacement of an approved version is outside MVP (PSA-06).

### G2.4 `activation_fee_payments` — independent fee attempts

```text
id                      UUID PK
activation_id           UUID NOT NULL FK -> paid_sales_activations(id)
amount_minor            BIGINT NOT NULL CHECK (amount_minor > 0)
currency                TEXT NOT NULL DEFAULT 'KZT' CHECK (currency = 'KZT')
status                  PENDING | PROCESSING | UNKNOWN | SUCCEEDED | FAILED NOT NULL
idempotency_key         TEXT NOT NULL UNIQUE
provider_operation_ref  TEXT NULL UNIQUE
payment_mode            SANDBOX | SIMULATION NOT NULL
created_at              TIMESTAMPTZ NOT NULL
updated_at              TIMESTAMPTZ NOT NULL
finalized_at            TIMESTAMPTZ NULL
next_check_at           TIMESTAMPTZ NULL
```

- Payment attempts are historical. Partial UNIQUE `(activation_id) WHERE status IN ('PENDING','PROCESSING','UNKNOWN')` prevents concurrent unfinished attempts. Partial UNIQUE `(activation_id) WHERE status = 'SUCCEEDED'` prevents multiple successful fee records. Historical `FAILED` attempts may coexist.
- `amount_minor` must equal the activation's frozen fee amount, checked by backend under locks; amount, currency, activation identity, idempotency key and provider correlation identifiers are immutable after assignment (provider reference may be assigned once when known). Do not accept client-calculated fee amounts.
- `SUCCEEDED`/`FAILED` require `finalized_at`; unfinished states require `finalized_at IS NULL`. `UNKNOWN` is unfinished and requires durable reconciliation. `next_check_at` must be set for unresolved attempts that require status polling, or an equivalent durable scheduled-work record must exist; do not allow indefinitely forgotten operations.
- `payment_mode` distinguishes simulation from sandbox and must propagate to API/reporting. A real production payment mode and its provider mapping require a separately approved integration design.
- A durable outbox/work item is required for dispatch and reconciliation; it may reuse the platform-wide outbox, **not** necessarily a new PSA-specific table. Its exact schema is handled in the Notifications/Worker block; the PSA contract requires transactional creation and recoverability.

### G2.5 Supporting indexes and integrity

- FK indexes for request/fee attempt lookups by activation, and a due-work index for unresolved `next_check_at` (if polling is used).
- Composite ownership constraints for approved request and payout association where possible; backend must additionally verify APPROVED status.
- Preserve audit records for each review, rejection, activation, suspension/resumption, and verified payment outcome; do not rely solely on mutable current status fields as complete history.
- No hard deletion of approved applications, payout snapshots used for approval, successful fee attempts, or audit evidence.

## G3. State machines and permission matrix

**Activation:**

```text
(no row) -> PENDING_VERIFICATION          [first request submitted]
PENDING_VERIFICATION -> FEE_PENDING       [Platform Admin approves request]
PENDING_VERIFICATION -> PENDING_VERIFICATION [request rejected; later new request]
FEE_PENDING -> ACTIVE                     [verified successful fee payment]
ACTIVE -> SUSPENDED                       [Platform Admin; reason required]
SUSPENDED -> ACTIVE                       [Platform Admin; eligibility rechecked]
```

A rejected request stays REJECTED; it is not reopened. No transitions out of `ACTIVE` except administrative suspension; Event cancellation/completion does not rewrite historical activation to a fake terminal state.

**Review request:** `PENDING -> APPROVED | REJECTED`; both terminal. Rejection requires nonempty reason. New submission creates a distinct row.

**Fee attempt:** `PENDING -> PROCESSING -> SUCCEEDED | FAILED | UNKNOWN`; `UNKNOWN -> SUCCEEDED | FAILED` only with reliable provider evidence. `PENDING -> FAILED` is allowed for a definitive pre-dispatch rejection where no bank operation could have started. If request dispatch may have happened, an ambiguous failure is UNKNOWN, never FAILED. No terminal-to-active transition.

| Action | Organizer | Platform Admin | Attendee |
|---|---|---|---|
| Submit activation request | Own Event | No special bypass | No |
| Approve/reject verification | No | Yes | No |
| Start fee payment | Own approved Event | No ordinary bypass | No |
| Suspend/resume paid sales | No | Yes | No |
| Pause/resume individual ticket type sales | Own Event | As separately authorized | No |

## G4. Transaction contracts — backend MUST implement

**Submit application**: resolve Event and actor; begin short transaction; lock Event first; lock/create activation safely under unique `event_id`; check Event lifecycle and Organizer role; validate snapshot, payout owner, paid terms and no pending request; insert immutable request and set `PENDING_VERIFICATION`; write audit/notification intent; commit. Duplicate first-row insertion must be handled by conflict/reload and revalidation, not by creating two activation rows.

**Review**: lock Event -> activation -> request (fixed order); recheck PENDING, role and request ownership. REJECTED: require reason and record reviewer/time; leave parent `PENDING_VERIFICATION`. APPROVED: bind exact reviewed payout snapshot, record reviewer/time, freeze positive fee amount and accepted terms, transition parent to `FEE_PENDING`; audit and notify atomically. Never overwrite rejected submissions. Approval must not trigger a fee payment automatically.

**Fee payment creation**: lock Event -> activation -> relevant fee attempts in stable order; require `FEE_PENDING`, approved request, frozen fee, valid Event lifecycle and no successful/unfinished fee attempt. Create one PENDING attempt and durable dispatch intent; commit; only then open Halyk widget or simulator. Same idempotency key returns the same attempt; new key after definitive FAILED may create a new attempt. Apply rate limits but no arbitrary lifetime retry count.

**Dispatch and provider callback**: do not hold database locks while contacting Halyk. Worker must claim durable work safely and recheck whether operation has already been dispatched; use provider idempotency guarantees only if confirmed. For callback/reconciliation, identify attempt from authenticated provider correlation without child locks, then lock Event -> activation -> attempt, validate authentic outcome, amount/currency/identity and legal transition. Confirmed success marks attempt SUCCEEDED and activation ACTIVE with `activated_at` exactly once in the same transaction. Failure leaves parent FEE_PENDING; UNKNOWN stays unresolved with scheduled reconciliation. Duplicate and out-of-order callbacks must not reactivate or duplicate work.

**Suspend/resume**: lock Event -> activation; Platform Admin only. Suspend ACTIVE -> SUSPENDED with nonempty reason, audit and notification. Resume SUSPENDED -> ACTIVE only after checking approved verification, confirmed fee success, paid terms and eligible Event; no new fee. Creation of a *buyer* Payment is the final paid-sales permission boundary for ordinary suspension, as already approved in v0.2: serialize both decisions through Event lock; already-created buyer Payments may finish, even if suspension subsequently wins. Emergency cancellation is separate and can require safe banking resolution.

**Event cancellation**: never start new activation applications/fee payments after cancellation. Do not automatically refund the activation fee, do not erase fee history, and do not conflate buyer refunds with activation-fee payment records. Applicable law may override product-level nonrefundability; any legally required exceptional refund needs a separately specified and audited procedure, not an undocumented status mutation.

**Crash recovery**: after commit and before provider dispatch, durable outbox/work remains claimable; after provider dispatch but before local acknowledgement, reconcile rather than blindly reissue. An UNKNOWN fee attempt blocks new attempts until resolved. DB transaction retry after `40P01`/`40001` is allowed with bounded attempts, but must not resend an external financial call as a side effect.

**Lock ordering**: follow global DL-01 and ensure PSA uses Event-first; if a flow also touches buyer Order/Payment, never lock activation after a lower-priority row while another flow does the reverse. All cross-domain operations must use a reconciled global lock-order contract before implementation.

## G5. Required failure and boundary behavior

| Scenario | Required result |
|---|---|
| Second simultaneous verification request | At most one PENDING; one request rejected or idempotently reused |
| Admin rejects with reason | Request REJECTED; no fee payment; Organizer may submit new request |
| Admin decision repeated | No duplicate transition, payout binding or notification intent |
| Fee widget closed before confirmed payment | No assumed success; pending/unknown resolved per provider contract |
| Fee attempt definitively FAILED | Activation remains FEE_PENDING; new attempt allowed |
| Timeout after dispatch | UNKNOWN; no new attempt; reconciliation required |
| Fee success webhook twice | One SUCCEEDED attempt and one activation; no second charge |
| Suspension races buyer Payment creation | Whichever acquires Event lock first controls permission at Payment creation |
| Suspension after buyer Payment created | Existing attempt may resolve; no new paid Payment |
| Organizer pauses ticket type | New reservations for paused type blocked; existing valid payment path not automatically cancelled |
| Organizer cancels Event after activation | Activation fee not automatically refunded; buyer refund obligations remain |
| Approved payout details need replacement | No direct edit; Support path, future change workflow outside MVP |

## G6. Backend ownership and acceptance checklist

The backend team MUST implement: (a) authorization and current Event status checks; (b) FSM transition guards, not merely row CHECKs; (c) transactional Event-first locking and revalidation; (d) fee quote snapshot and immutable payout snapshot; (e) partial unique and composite ownership integrity; (f) idempotent payment attempt creation, provider callbacks and reconciliation; (g) durable dispatch/recovery; (h) audit and notifications; (i) sandbox/simulation labeling; (j) privacy-safe handling of verification and payout information; (k) the nonrefundability warning and paid-terms acceptance evidence before fee payment.

Backend/QA must test first submission races, simultaneous admin decisions, duplicate fee creation, callback replay and out-of-order delivery, UNKNOWN resolution, suspension-vs-Payment races, cancellation while fee is pending, fee success after cancellation (financial incident/administrative resolution; never reactivate cancelled Event), and crash between transaction commit and provider dispatch. SQL execution, concurrency and Halyk sandbox verification are delegated to backend and are **not claimed completed**.

## G7. External integration dependencies and approved PSA-08/09 clarifications

- **APPROVED PSA-08:** fixed MVP activation fee 30,000 KZT (3,000,000 tiyn), sourced from backend configuration; client cannot override; payment amount frozen. No platform tariff-management table required for MVP.
- **APPROVED PSA-09:** manual demo verification for individuals and legal entities: name/legal name, IIN/BIN, responsible contact, email/phone, bank name, IBAN and account-holder name. Validate formats/checksums as applicable; this does not prove real identity or bank ownership. Encrypt IIN/BIN and IBAN at application level with keys outside PostgreSQL. Approved payout snapshot is immutable. Real KYC/KYB and payout routing remain provider/legal integration gates.
- **Halyk fee-payment API**: invoice/correlation fields, definitive failure criteria, webhook signature validation, safe retry/idempotency and Status API capabilities remain PROVISIONAL until provider documentation and sandbox evidence. The architecture requires safe behavior regardless.
- **Exceptional legally required activation-fee refund** and settlement handling are not implemented by the ordinary buyer Refund Service; require explicit later design if applicable.
- **Outbox physical DDL** will be reconciled with Notifications/Workers; this section defines mandatory durability but not an invented provider-specific worker schema.

**SRS mapping:** §§3.2, 4.5, 4.6, 4.12, 8. The manual verification and nonrefundable cancellation policy are approved BiletFlow design decisions, not explicit requirements of SRS. **Next artifact:** consolidated v1.0 `schema.sql` after remaining modules; backend owns SQL execution/tests.


---

# Part H — Promotions & Campaign QR (PC-01–PC-15 APPROVED; physical DDL pending)

> **Priority and provenance.** This section is the detailed implementation contract for §§38–41. The §38 core model and this detailed contract agree: no global codes, no single `ticket_type_id`, immutable financial conditions. Existing checkout/hold/redemption rules in §§33–41 remain in force unless explicitly clarified below. This is an architecture specification, **not** an executed PostgreSQL migration. Provider integration and SQL testing belong to backend.

## H1. Product semantics and scope

- Every Promo Code belongs to **exactly one Event** (`event_id NOT NULL`). Global/platform-wide codes are out of MVP. Organizer may create codes only for Events they manage.
- A code may be **standalone** or linked to one `promotional_campaign`. One campaign belongs to one Event and may contain many codes. A campaign is a marketing/reporting grouping, not an advertising-service integration or an organization. No separate campaign status/FSM is needed.
- One Order uses at most one Promo Code. One successful Order consumes **one redemption**, regardless of number of tickets; quantity sold is counted separately.
- `discount_type = PERCENTAGE | FIXED_AMOUNT`; `application_scope = ORDER | SELECTED_TICKET_TYPES`. ORDER covers all ticket line subtotals in the Order; SELECTED_TICKET_TYPES covers only explicitly linked types. A code scoped to selected types must have at least one eligible type belonging to the same Event. A code cannot apply to a different Event.
- Organizer chooses selected Ticket Types using a multi-select control backed by the Event's actual Ticket Types. The backend validates membership, permissions, uniqueness and nonempty selection. The code, type, scope, amount/percentage, eligible types, validity window, maximum redemptions and campaign association are immutable after creation. No normal hard-delete. `is_active` may be toggled off/on by authorized Organizer; toggling is audited and does not rewrite existing Orders or protected holds.
- Percent discounts apply to the eligible base only; fixed discounts are applied **once per Order** to the eligible base, not once per ticket. Actual discount is capped by the eligible base, never negative. A zero-total Order uses the already-approved free/zero-total checkout confirmation path without a buyer Payment and consumes the promo once on confirmation.
- Promo text is shared between Ticket/Seat Selection and Checkout as frontend checkout state. Campaign link pre-fills it. The backend owns validation and pricing; preview never creates a Reservation/Order/Redemption. After an Order is created its composition and financial snapshot cannot be edited to change a code; a different code requires a new checkout/Order flow.

## H2. Relational model — physical design contract

### `promotional_campaigns`

| Column | PostgreSQL type | Constraints/meaning |
|---|---|---|
| `id` | UUID | PK |
| `event_id` | UUID | NOT NULL FK events; UNIQUE `(id,event_id)` for ownership FK |
| `name` | TEXT | NOT NULL, trimmed nonempty |
| `created_by_user_id` | UUID | NOT NULL FK users |
| `created_at` | TIMESTAMPTZ | NOT NULL |

Campaign name is a display/reporting label, not a financial identifier. No `status` or mutable financial terms. Organizer may create multiple campaigns per Event. Historical campaign rows referenced by codes must be retained.

### `promo_codes` (reconciled with v0.2 §38)

| Column | PostgreSQL type | Constraints/meaning |
|---|---|---|
| `id` | UUID | PK; UNIQUE `(id,event_id)` for composite membership FKs |
| `event_id` | UUID | NOT NULL FK events |
| `campaign_id` | UUID | NULL; if set, composite FK `(campaign_id,event_id)` to campaigns `(id,event_id)` |
| `code` | CITEXT or normalized TEXT | NOT NULL, case-insensitive UNIQUE; trim and normalize consistently |
| `discount_type` | ENUM | PERCENTAGE, FIXED_AMOUNT |
| `application_scope` | ENUM | ORDER, SELECTED_TICKET_TYPES |
| `percentage_bps` | INTEGER | only for PERCENTAGE; 1..10000 (100% = 10000 bps) |
| `fixed_amount_minor` | BIGINT | only for FIXED_AMOUNT; positive, KZT minor units (tiyn) |
| `max_redemptions` | INTEGER | NULL unlimited; otherwise positive |
| `redemption_count` | INTEGER | NOT NULL DEFAULT 0, >=0; maintained atomically; history remains authoritative |
| `valid_from`, `valid_until` | TIMESTAMPTZ | NOT NULL; `valid_from < valid_until`; interval `[from,until)` |
| `is_active` | BOOLEAN | NOT NULL DEFAULT TRUE; only ordinary mutable eligibility field |
| `campaign_token` | UUID | NULL for standalone; UNIQUE, required iff campaign_id is set; stable public UUIDv4 (QR-01) |
| `created_at`, `updated_at` | TIMESTAMPTZ | NOT NULL; `updated_at` reflects enable/disable and system counters |

The old generic `discount_value` and nullable global scope are replaced by explicit typed values and nonnullable event membership. The actual DDL must implement a CHECK requiring exactly the appropriate discount-value column. **QR-01 approved physical choice:** `campaign_token UUID UNIQUE NULL` is generated by backend using a cryptographically secure UUIDv4 for campaign-linked codes and never changes. The QR URL embeds this public marketing identifier; the same token regenerates the same URL. It is not a secret, permission grant, payment proof or Check-in credential. Backend still checks current promo eligibility and PRIVATE Event access.

### `promo_code_ticket_types`

| Column | PostgreSQL type | Constraints/meaning |
|---|---|---|
| `promo_code_id` | UUID | NOT NULL |
| `event_id` | UUID | NOT NULL; ownership verification |
| `ticket_type_id` | UUID | NOT NULL |

Primary key `(promo_code_id,ticket_type_id)`; composite FKs `(promo_code_id,event_id)` and `(ticket_type_id,event_id)` to corresponding UNIQUE parent keys. An ORDER-scope code has no rows here; a SELECTED_TICKET_TYPES code has at least one row. The cross-row existence/no-row condition requires an atomic backend validation under the code/Event lock or a carefully designed deferred DB trigger; a simple CHECK cannot enforce it. The selected-type set is immutable after creation.

### Existing `promo_holds` and `promo_redemptions`

Keep v0.2 structures and semantics. `promo_holds.order_id` is UNIQUE; one Order may have at most one effective hold and one promo. `promo_redemptions.order_id` is UNIQUE; its `(promo_code_id,order_id,discount_minor,redeemed_at)` records exactly one successful application. Ensure code/Order/Event ownership with composite FK where possible and backend checks. Successful redemptions are immutable. Maintain `redemption_count` atomically with inserting the redemption in the **same** confirmation transaction. Do not count previews, failed payments or mere QR visits as redemptions.

### Orders and line snapshots

Keep `orders.promo_code_id`, `orders.subtotal_minor`, `orders.discount_minor`, `orders.total_minor` and the existing immutable pricing snapshot. Add `order_items.line_discount_minor BIGINT NOT NULL DEFAULT 0` (plus a line subtotal if not already derivable unambiguously from frozen unit price × quantity). The sum of line discounts must equal the Order discount attributable to this code; if other fees/discount mechanisms exist, use separately named totals and a reconciled financial equation, **not** a false blanket `total = subtotal - discount` that omits processing fees. The entire Order is the only refund unit in MVP; confirmed refund amount is based on the actual successful Payment, not gross ticket face value.

## H3. Exact discount computation (backend authoritative)

All values are integer tiyn (`BIGINT`), never floating point. `percentage_bps` expresses basis points: `10000` = 100%. Let `s_i` be each frozen eligible line subtotal (>=0), `S = SUM(s_i)`, `F = fixed_amount_minor`.

- `PERCENTAGE`: `D = floor(S * percentage_bps / 10000)`.
- `FIXED_AMOUNT`: `D = min(S,F)`.
- If `S=0`, no discount is applied; a SELECTED_TICKET_TYPES promo with no matching positive-value line must be rejected as inapplicable rather than consuming a redemption for zero benefit (unless a separately approved product rule later changes this).
- Calculate multiplication in a checked/wide integer or NUMERIC intermediate to avoid `BIGINT` overflow; cast back only after range checks. No frontend-computed money is authoritative.
- Distribute `D` proportionally **only among eligible Order Items**. For each eligible line with `S>0`, compute `q_i = floor(D*s_i/S)` and remainder `r_i = D*s_i mod S`. Let `R = D - SUM(q_i)`; assign +1 tiyn to the `R` eligible lines with greatest remainder, tie-break by stable `order_item.id` ascending (or a persisted deterministic pre-insert line key). Ineligible lines receive zero. This is largest-remainder allocation; guarantees `SUM(line_discount_minor)=D`, `0<=line_discount_minor<=s_i`, and no negative net line. The line identity/tie-break must be stable across retries; if UUIDs are generated after pricing, use a stable persisted line ordinal instead.
- Freeze computed values in the Order creation transaction. Once frozen, no promo toggles, expiry or changes to campaign metadata recalculate the Order.

## H4. Creation, disable/re-enable and checkout transaction contracts

**Create code:** authenticate Organizer, resolve Event and eligible Ticket Types, lock Event and required rows in DL-01 order, validate event ownership, nonempty code, type/scope/value/time/limit and campaign membership; insert code and all selected-type associations atomically. Unique code collision returns a validation error, not a second code. Once committed, financial terms and associations cannot be edited through ordinary API. Audit creation.

**Disable / re-enable:** authorize Event owner, lock Event then promo row, set `is_active` idempotently, record audit. Disabling stops new promo applications/holds, but does **not** cancel existing frozen Orders or valid/protected holds. Re-enabling uses original unchanged terms and never bypasses expiry or exhaustion. No new `campaign.status`.

**Preview:** user may enter code on Ticket Selection or Checkout; Campaign QR supplies it automatically. Backend validates code/event/type/time/active/limit and computes a provisional discount. No hold or redemption. Preview must be revalidated at Order creation.

**Create paid Order:** under Event/Reservation/Promo locks in a globally reconciled order, recheck inventory, eligibility and promo capacity including effective holds. Atomically freeze Order + Items + discount allocation and create promo hold; commit. A promo hold is protected while unresolved banking prevents safely releasing its discounted Order. A promo code disabled **after** the hold was committed cannot invalidate that Order. Order creation and Payment creation remain separate, per §37.

**Start buyer Payment:** under agreed DL-01 locks, validate frozen Order/Reservation and paid-sales permission. For an already valid protected hold, do not reapply `promo_codes.is_active`, expiry or `max_redemptions` as if it were a new redemption; do recheck the actual hold/Order safety and absence of conflicting financial work. Provider call only after DB commit. A new promo is never substituted into an immutable Order.

**Confirm successful paid Order:** in one short transaction, idempotently mark Payment/Order/Reservation, consume hold, insert one redemption, update counter, issue tickets. Confirmed zero-total checkout does the analogous atomic work **without creating a buyer Payment**. Failure, expiry and UNKNOWN follow v0.2 §40: a retryable failed AUTH does not automatically release the hold; final cancellation/expiry releases it only when safe with bank state.

**Concurrency:** serialize competing promo hold creations and toggles on the promo row (Event-first when Event lock required); count `redemption_count + effective holds` exactly once per reserved Order. Lock affected promo rows deterministically. Enforce DB uniqueness for Order→hold and Order→redemption; handle `40P01`/`40001` by bounded retry of **database** transaction only, never blind repeat of provider calls. If the campaign QR link is opened 100 times but only 15 confirmed Orders redeem it, the redemption count is 15, not 100.

## H5. Campaign QR and reporting

- Each campaign-linked Promo Code gets one stable trackable HTTPS Event link carrying an opaque code/campaign token, never trusted discount amounts or personal data. Opening the link resolves the Event and pre-applies the code in frontend checkout state after server validation. It does **not** reserve seats, create Order or consume a redemption.
- The campaign QR is a marketing link, visually/functionally distinct from ticket admission QR. Admission/check-in endpoints must reject it by route, payload type and signature/credential format. Private Event access remains governed by personal invitations; a Campaign QR never grants private access.
- Reporting uses successful `promo_redemptions` joined to frozen Orders/Items/Tickets and refunds, grouped by `promo_codes.campaign_id`. Count distinct confirmed Orders (redemptions), ticket quantities, gross ticket subtotal, discount and net after discounts; separately show refunds/net after refunds with explicit definitions. Avoid double counting when joining tickets, payments and refunds; aggregate by Order before grouping. Orders without a redemption are not credited merely for opening a Campaign QR. No GA4 required for MVP.
- Do not delete campaigns or codes referenced by history. Retain audit of creation, disable and re-enable. Authorization restricts Organizer reporting to own Events.

## H6. Required backend acceptance cases (execution delegated to backend team)

1. Percentage/fixed × ORDER/SELECTED_TICKET_TYPES; multiple eligible types; no eligible type; discount larger than eligible base; 100% and zero-total Order.
2. Fractional-tiyn percentage rounding, proportional largest-remainder tie-break, huge amounts/overflow, sums of frozen line discounts, and nonnegative line totals.
3. Code scope cannot cross Events; campaign and selected type ownership enforced; code collisions case-insensitive; global codes impossible.
4. Concurrent last-slot checkouts, disable-versus-hold race, expiry-versus-hold, duplicate webhook, retryable failed AUTH, UNKNOWN, protected hold, cancellation/release and zero-total redemption.
5. Frozen Order remains unchanged when code is disabled/expired/re-enabled; attempt to edit immutable code terms rejected; no new promo on existing Order.
6. Campaign QR cannot be used for Check-in or bypass PRIVATE Event invitation; URL does not contain authoritative money; opening link never consumes promo.
7. Reports count confirmed Orders/tickets accurately without join multiplication, distinguish gross/discount/refund/net and preserve historical campaigns.

## H7. Integration notes / remaining non-product work

- The approved MVP buyer Order total excludes Organizer-borne processing fees: `total_minor = subtotal_minor - discount_minor` (§34). Preserve this invariant in physical DDL and reconcile Halyk payment amounts with it. A future buyer-borne fee would require an explicitly approved schema and formula change.
- QR-01 fixes the reconstructible Campaign QR representation to `promo_codes.campaign_token UUID`; no hash-only Campaign QR column is used.
- Apply the canonical DL-01 lock ordering to Reservation/Promo/Order: resolve IDs without row locks; acquire Event first, then inventory configuration rows if required, then Promo Code (when involved), then Order, then Reservation; never acquire Promo Code after holding Order/Reservation. All paths that lock both Promo Code and Order must follow the **same order** (see DL-01 clarification). Do not introduce triggers that reverse parent-child lock order.
- §38 contains the current single-Event, multi-Ticket-Type model and points to H1–H6; no global-code or single-type rule is authoritative.
- This section is not proof of executed SQL, concurrency tests, Halyk integration or full v1.0 readiness.


---

# Part I — Notifications, Inbox, Email and Transactional Outbox (APPROVED logical contract; physical DDL pending)

> **Decision register:** N-01 through N-08 approved; N-06 mass fan-out and N-07 secure invitation links are binding technical choices. N-08 defines provider-neutral email behavior, expiry skipping, and idempotent read semantics. This section is an approved logical implementation contract, pending integrated physical DDL. Existing v0.3 business-domain transactions remain authoritative. No claims of executed SQL or provider integration tests.

## I1. Scope and semantics

- Three independent PostgreSQL responsibilities: `outbox_events` (durable work intent), `notifications` (one Inbox item per user), `notification_deliveries` (one email-delivery task per intended email). No `user_notifications` join table in MVP.
- `notifications.read_at IS NULL` means unread; non-NULL means read. Reading is idempotent and only the recipient may mark it read. No automatic Inbox deletion in MVP; production retention and erasure obligations remain OPEN.
- Email is not an Inbox state. `SENT` means provider accepted a message, **not** recipient delivery/read. One user can have Inbox success and email failure without changing the business outcome.
- An event may require only Inbox, only Email (e.g., account verification or private invitation before registration), or both. No automatic emailing of every Inbox entry.
- `outbox_events` MUST be committed atomically with the business change that creates the obligation; email/Inbox processing happens asynchronously. Do not make bank, SMTP, PDF or external API calls while holding business row locks.
- A business event may fan out to many users. Deduplicate by **user** for one event-change announcement, not by Ticket or Order; individual refund completions are separate per Refund/Order.
- SRS-required categories: account verification; free registration/purchase confirmation and ticket delivery; payment failure; Event update/cancellation; confirmed refund completion; organizer payout status; Support message, assignment and status changes. Previously approved additional events: Event staff invitations/revocation (EVENT_ADMIN and EVENT_SUPPORT); PRIVATE invitations; application/change/cancellation and activation review decisions; paid-sales suspension/restoration; refund reminders/escalation and operational financial incidents. Event-specific recipient/role authorization remains mandatory.
- On normal successful checkout, one consolidated buyer confirmation covers both Order confirmation and ticket availability. Separate `TICKETS_ISSUED` notification only when genuinely issued later, to avoid duplicate notices.
- Extra non-critical informational notification types may be proposed by backend. New financial/legal obligations, role changes or notification of sensitive data require approval. Event types and channel policy are server-side, never client-authoritative.

## I2. Logical schema and integrity requirements

### I2.1 `outbox_events`

```text
id UUID PK
business_event_key TEXT NOT NULL UNIQUE  -- stable idempotency key from source transition
aggregate_type TEXT NOT NULL
aggregate_id UUID NOT NULL
event_type TEXT NOT NULL
payload JSONB NOT NULL DEFAULT '{}'
status PENDING | PROCESSING | COMPLETED NOT NULL DEFAULT PENDING
created_at TIMESTAMPTZ NOT NULL
processing_until TIMESTAMPTZ NULL
processed_at TIMESTAMPTZ NULL
last_error_code TEXT NULL
fanout_cursor_user_id UUID NULL  -- durable keyset checkpoint for eligible mass events
fanout_cutoff_at TIMESTAMPTZ NULL -- event-specific frozen recipient eligibility boundary
```

- Unique `business_event_key` is stable across retries of the same **logical** transition, e.g. `ORDER_CONFIRMED:<order_id>`; a distinct actual transition must use a distinct key (do not collapse separate Support messages). Source transaction inserts outbox with `ON CONFLICT` semantics only when it is the same logical event.
- `payload` carries minimal non-secret identifiers and safe display context, not bank credentials, card details, raw invite tokens, full IIN/BIN, or sensitive free-text. If personal data is needed for rendering, resolve it through authorized internal data access at dispatch time or use encrypted restricted delivery data.
- `PROCESSING` requires a lease expiry; stale leases can be reclaimed. Processing state alone is never proof that every recipient was notified. Index due events by `(status, processing_until, created_at, id)` or an equivalent worker-friendly index.
- Event completion must only occur after recipient fan-out work is durably finished; see I4 for crash-safe batching.

### I2.2 `notifications`

```text
id UUID PK
outbox_event_id UUID NOT NULL FK -> outbox_events
user_id UUID NOT NULL FK -> users
type TEXT NOT NULL
title TEXT NOT NULL
body TEXT NOT NULL
action_url TEXT NULL
read_at TIMESTAMPTZ NULL
created_at TIMESTAMPTZ NOT NULL
UNIQUE(outbox_event_id, user_id)
```

- One Inbox row per recipient per logical outbox event. If a future business event legitimately requires two separate notices to the same user, create distinct logical outbox events rather than silently weakening uniqueness.
- `action_url` must be an allowlisted **internal relative route**, with authorization checked again when opened. Do not put secret invitation tokens in Inbox URLs or public analytics/logs.
- `read_at` is set once by recipient-authorized action (`UPDATE ... WHERE user_id = authenticated_user_id AND read_at IS NULL`); retries and duplicate requests must not reset it. Recommended index `(user_id, created_at DESC, id DESC)` and partial unread index `(user_id, created_at DESC) WHERE read_at IS NULL`.
- Never send Inbox messages to users whose account relationship is not authorized for that business event; a ticket count does not establish a distinct recipient list.

### I2.3 `notification_deliveries`

```text
id UUID PK
outbox_event_id UUID NOT NULL FK -> outbox_events
recipient_user_id UUID NULL FK -> users
recipient_email CITEXT NOT NULL
purpose_key TEXT NOT NULL  -- distinguishes legitimately different emails for same event/recipient
template_key TEXT NOT NULL
template_version TEXT NOT NULL
locale TEXT NOT NULL
template_data JSONB NOT NULL DEFAULT '{}'
encrypted_secret_payload BYTEA NULL  -- restricted temporary invitation-link material
secret_key_version TEXT NULL
invitation_id UUID NULL FK -> private_event_invitations  -- required for private-invite deliveries; verify schema on integration
status PENDING | PROCESSING | SENT | FAILED | SKIPPED NOT NULL DEFAULT PENDING
attempt_count INTEGER NOT NULL DEFAULT 0
next_attempt_at TIMESTAMPTZ NULL
processing_until TIMESTAMPTZ NULL
provider_message_id TEXT NULL
sent_at TIMESTAMPTZ NULL
skipped_at TIMESTAMPTZ NULL
skip_reason TEXT NULL
last_error_code TEXT NULL
created_at TIMESTAMPTZ NOT NULL
UNIQUE(outbox_event_id, recipient_email, purpose_key)
```

- `recipient_user_id` nullable for pre-registration PRIVATE invitations; email address is snapshotted for the specific delivery. Normalize recipient address for idempotency; use validated email, do not infer identity from email alone.
- Email subject, body, action link and CTA are rendered from versioned backend templates (`template_key`, `template_version`, `locale`, safe `template_data`). Templates may live in code; no template table required for MVP. A queued task must retain the ability to render the originally selected version (or a securely stored immutable render) across deployments.
- `template_data` MUST NOT contain raw invitation tokens if generic workers, DB logs, or analytics could expose them. PRIVATE invitation email obtains its personal link via a restricted secret-delivery path; avoid persisting the raw token in plain JSONB. If regenerating the link is impossible from a stored hash, implement an encrypted recoverable payload or secure one-time link issuance workflow. For PRIVATE invitations, generate the token once; atomically store its hash in the invitation and an authenticated-encrypted recoverable copy in `encrypted_secret_payload` on the delivery job, with `secret_key_version`. Encryption keys live outside PostgreSQL. Restrict decryption to the mail worker; never log the token, persist it in `template_data`, or put it in ordinary outbox payload. Clear the encrypted secret and key version when delivery is terminal (`SENT`, `SKIPPED`, or final `FAILED`) or the invitation expires, while retaining nonsecret delivery history. A manual resend after secret purge requires a newly authorized invitation/link flow, not recovery from a hash.
- `attempt_count` between 0 and 5; `SENT` and `SKIPPED` terminal for automatic dispatch. `SKIPPED` means the private invitation expired before a new send was initiated; it is not a provider failure. `FAILED` represents terminal exhaustion or permanent rejection; transient failures must return to `PENDING` with `next_attempt_at`, not permanently fail after one attempt. Recommended index `(status, next_attempt_at, id)` plus stale lease index.
- Admin re-send of a critical email is a separate audited explicit operation, with a distinct delivery idempotency purpose/key; do not overwrite an existing `SENT` row or erase its history.

- `encrypted_secret_payload` is nullable for ordinary emails; when present, its decryption is restricted to the authorized email worker. Its ciphertext and key metadata are not returned by Inbox or public APIs. Cleanup of expired invitation secrets is a separate idempotent maintenance operation.

## I3. Delivery FSM and worker contract

- Inbox has no delivery FSM; insert committed row = available in Inbox. Its creation is retried from outbox until success, with `UNIQUE(outbox_event_id,user_id)` preventing duplicates.
- Email: `PENDING -> PROCESSING -> SENT` on provider acceptance; `PENDING -> SKIPPED` when a linked invitation has expired before dispatch; transient error/expired lease `PROCESSING -> PENDING` while attempts remain; permanent rejection or fifth failed attempt `PROCESSING -> FAILED`. A stale lease with uncertain provider result must not be treated as proof that no email was sent. Use provider idempotency where supported; otherwise document at-least-once delivery and possible duplicate mail after a timeout.
- Before claiming or retrying a PRIVATE invitation email, atomically recheck the linked invitation `expires_at` against current PostgreSQL time after obtaining the necessary row lock. If expired, set `SKIPPED`, `skipped_at`, and `skip_reason=INVITATION_EXPIRED`, purge recoverable secret, and do not call provider. A concurrent worker must not race an expiry decision: lease/claim and eligibility decision must be serialized. Once the provider has accepted a send before expiry, later expiry does not undo delivery or change `SENT` to `SKIPPED`. Provider-side delivery may arrive after expiry; the link remains invalid.
- Increment `attempt_count` exactly when claiming a real send attempt; use bounded exponential backoff (intervals are configuration). Never hold DB transaction while calling email provider.
- Worker claims a bounded batch in a short transaction with `SELECT ... FOR UPDATE SKIP LOCKED`, atomically marks `PROCESSING`, sets lease, commits, then performs external send. Claim queries must include due `PENDING` tasks with `next_attempt_at IS NULL` and expired `PROCESSING` leases. Reclaim safely and enforce attempt cap.
- On provider acceptance, persist `SENT`, `sent_at`, provider correlation. Provider callback or retry may only move state in allowed direction. Log safe error code, not raw sensitive provider responses.
- Email failure cannot rollback successful Order, Payment, Refund, Event Change or Invitation transaction. Monitor terminal FAILED deliveries; critical messages can be reissued by authorized staff.

## I4. Fan-out, idempotency and mass delivery — N-06 APPROVED

- **No fourth recipients table for MVP.** For Event cancellation or approved material Event change, derive the distinct eligible buyer `user_id`s from retained historical `orders`/`tickets` of that Event, including orders subsequently refunded/cancelled. The relevant eligibility is based on **historical entitlement at the business-event boundary**, not a current mutable Order status. Store the source event's cutoff timestamp (`fanout_cutoff_at`) and immutable event identity in `outbox_events`. The cancellation/approved change transaction must serialize against issuance through the established Event lock so new eligible purchases cannot appear after that boundary. If a future mass-event type lacks such a reconstructible stable source, it requires its own approved durable recipient strategy; do not silently reuse this algorithm.
- Traverse distinct recipient UUIDs in ascending order using **keyset pagination** (`user_id > fanout_cursor_user_id`) rather than OFFSET. For each bounded batch, create intended Inbox and Email tasks with conflict-safe inserts, and advance `fanout_cursor_user_id` **in the same transaction**. If a crash happens before commit, retry the same batch; after commit, resume from the stored cursor. The cursor is an implementation checkpoint, not evidence of actual email delivery.
- For one logical announcement, `UNIQUE(outbox_event_id,user_id)` prevents duplicate Inbox rows and `UNIQUE(outbox_event_id,recipient_email,purpose_key)` prevents duplicate email tasks. A user with multiple qualifying Orders receives one event-level notice. Per-Order Refund completion uses separate outbox events and does not collapse legitimate distinct refunds.
- Set outbox `COMPLETED` only when the stable recipient query has no remaining users and all their Inbox/email tasks are durably committed. Deliveries themselves continue independently; do not wait for SMTP to finish before completing fan-out.
- Event source queries must use immutable history and a cutoff, with explicit tests for changes in Order statuses, refunds, multiple Orders per buyer, concurrent cancellation/payment finalization, deleted/deactivated users, and crashes between batches. If legally mandated erasure removes recipient identity, retention/erasure policy takes precedence and requires an explicit resolution rather than inventing an address.
- Keep fan-out off the checkout/payment latency path: business transaction writes one small outbox row; worker expands it asynchronously.

## I5. Invitations and authorization

- Event Admin invitation: Inbox and Email refer to one authoritative `event_staff_invitations` record. Opening either channel checks current invitation status, expiry, addressee, and role; an email does not grant role by itself.
- PRIVATE invitation: email contains registration/sign-in instruction and a personalized 24-hour link. Recipient must authenticate with the matching **verified** email. The 24-hour clock starts on invitation creation and is not extended by registration or delivery delay. The link is not a ticket, nor does it grant access to others. Already issued Tickets and timely initiated protected Payments retain previously approved behavior.
- Password/account verification email can be email-only; user need not have an Inbox entry before account verification. Keep verification tokens outside generic Inbox and non-secret outbox payloads.
- Support notifications must be sent only to authorized participants/staff. For Organizer/Platform Admin, current event/case relationship is checked before rendering sensitive case context.
- `notifications` read/update endpoints enforce `user_id = authenticated_user_id`; `notification_deliveries` operational status is not a public user API. A safe internal `action_url` never bypasses object-level authorization.

## I6. Notification event/channel policy — approved N-02

| Business event | Recipient | Inbox | Email |
|---|---|:---:|:---:|
| Account verification | Account email | No | Yes |
| Free registration / paid Order confirmed + Tickets issued | Buyer | Yes | Yes |
| Buyer payment failure (actionable, not each internal retry) | Buyer | Yes | Yes |
| Material Event update or cancellation | Distinct affected buyers | Yes | Yes |
| Confirmed Refund succeeded | Buyer | Yes | Yes |
| New Support message | Authorized case participant | Yes | Yes |
| Support status changed | Authorized case participant | Yes | Optional per policy |
| Event Admin invitation / role revoked | Invited or affected user | Yes | Yes |
| PRIVATE Event invitation | Invited verified-email target (may not yet have account) | No | Yes |
| Event application/change/cancellation decision | Organizer | Yes | Yes |
| Paid-sales verification decision, fee success, suspension/restoration | Organizer | Yes | Yes |
| New customer refund request; failed final refund | Organizer | Yes | Yes |
| Refund reminder at 24h | Organizer | Yes | Yes |
| Refund escalation after 48h; unresolved financial incident | Platform Admin | Yes | No |
| New activation application; support assignment | Authorized admin/staff | Yes | No |
| Organizer payout status (if payout workflow exists) | Organizer | Yes | Yes |

- `Optional per policy` does not delegate an undefined random choice to developers: choose the channel when implementing the Support module and record the final event policy there. SRS requires in-app **or** email for support status changes.
- Extra informational types may be added without new business behavior; financial/legal notification rules need explicit approval. Do not expose financial secrets, IIN/BIN, bank credentials, raw invitation tokens, or unrelated personal information.

## I7. Backend acceptance checklist (SQL execution delegated to backend)

1. Duplicate business transition/webhook cannot create duplicate outbox event; repeated outbox processing cannot duplicate Inbox or email tasks.
2. Crash before/after fan-out batch commit resumes correctly; 10,000-recipient cancellation yields exactly one Inbox row per distinct user and one intended email task per recipient, without missing users.
3. Two workers claim disjoint tasks; expired leases recover; no HTTP call under PostgreSQL locks.
4. Email temporary failure retries up to five attempts, permanent failure terminates; provider-accepted timeout is handled as potentially delivered (no false exactly-once claim).
5. `read_at` changes only for owner and is idempotent; unread index and recipient filtering work.
6. PRIVATE invite to nonexistent account delivers secure link, respects 24h expiry, and cannot be accepted by different verified email; no raw token in ordinary logs.
7. Refund `UNKNOWN` never emits success notification; event cancellation notification does not pretend refund is complete.
8. Failed email does not rollback business transaction; Inbox and Email statuses remain independent.
9. Template version remains renderable after deployment; locale and safe action paths render correctly.
10. PRIVATE invitation delivery pending after its 24-hour deadline is `SKIPPED` without a new provider send, with secret purged and nonsecret audit history retained; accepted sends may arrive late and never extend invitation validity. Repeated mark-read calls preserve first `read_at`.
11. Production retention/privacy requirements are resolved before production implementation; fan-out cursor and encrypted invitation secret are implemented as specified, not left for developers to invent.

## I8. Remaining external and production dependencies

- N-06 mass fan-out uses three tables and a durable keyset cursor on `outbox_events` for Event cancellation/change; additional fan-out types must prove stable recipient reconstruction before reuse.
- N-07 invitation delivery uses a temporary authenticated-encrypted secret in `notification_deliveries`; key management and secure cleanup are mandatory implementation requirements. N-08: no automatic deletion of Inbox/history in MVP; expired unattempted invitation emails are `SKIPPED`, and all read timestamps are first-write-only.
- Email integration MUST use a provider-neutral adapter with capability flags for status lookup, provider idempotency and delivery webhooks. These features are optional; do not assume they exist. `SENT` means provider acceptance only. When provider acceptance is uncertain and lookup is unavailable, bounded at-least-once retries may duplicate external emails; database uniqueness does not guarantee exactly-once external delivery. No status lookup API is required for MVP.
- Exact provider mail API/idempotency, delivery receipt semantics, retention/legal erasure, and email transport settings are backend/integration gates.
- Four previously acknowledged v0.3 integration backlog items (DL-01 inventory lock alignment; used-ticket refund/check-in history; canonical campaign QR token representation; editorial historic draft language) remain tracked and are not silently declared resolved by this v0.4 addition.


## I9. N-08 integration clarification — APPROVED

- The email adapter is provider-neutral: application code persists and claims delivery tasks, while a replaceable transport adapter performs actual send. Optional status/reconciliation and provider idempotency are used only when verified for the selected provider; absence of either is not a deployment blocker for MVP.
- PRIVATE invitation `expires_at` remains exactly creation + 24 hours. `SKIPPED` applies to a job not yet sent/accepted by the provider when its invitation has expired. It does not cancel a message already accepted or revoke a timely initiated Payment. No retries after expiry.
- A worker must not expose or log the decrypted invitation URL; purge the encrypted delivery secret at `SENT`, `FAILED`, `SKIPPED`, or expiry, while retaining the nonsecret delivery row. No blanket cleanup of user Inbox or email audit history in MVP.
- A recipient marking an Inbox item read twice is a harmless idempotent request: only the first successful change sets `read_at`; no second update, audit duplication, or state transition is required.
- The N-06 three-table fan-out is limited to event changes/cancellations where immutable source history plus an event cutoff produces a stable recipient set. Do not assume that merely storing a cursor makes arbitrary mutable queries safe. If eligibility cannot be reconstructed consistently for a future event type, revise the recipient strategy before enabling that type.

---

# Part J — Support Cases & Asynchronous Chat (APPROVED S-01–S-14; physical DDL pending)

> Business decisions APPROVED. Physical SQL and integration tests NOT executed. This section supersedes the earlier Part J review text, not the existing Notifications, Refunds, roles, or DL-01 contracts. A Support Case is a ticket with an asynchronous text thread, not a realtime messenger.

## J1. Business model and entry points

- `EVENT_SUPPORT` case scope: event-specific; requester, event Organizer, active Event Support assignees (within permitted case visibility), and explicitly escalated Platform Admin can access according to J5. Organizer remains accountable when no staff are appointed. `EVENT_SUPPORT` is also a separate event role in `event_user_roles`; these names refer to different concepts.
- `PLATFORM_SUPPORT` case scope: requester and authorized Platform Admin. Any authenticated user may open one. Event Admin does not inherit event-support privileges.
- One form: required category (including `OTHER`), required initial free-text message, optional custom subject for OTHER. Event Details, Order Details and Ticket Details prefill event/order/ticket context and default to EVENT_SUPPORT; navbar Support opens PLATFORM_SUPPORT. Backend validates event/owner/related-entity integrity; a client-provided ID never grants access.
- Organizer appoints EVENT_SUPPORT through existing event staff invitations/roles after event creation; no required Event Application staff field and no Event Change Request. Event Support is limited to case processing, not financial actions, check-in, or event administration. Organizer responsibility must be included in Event Organizer Terms; acceptance/version tracking belongs to the separate agreements integration backlog.
- `previous_case_id` optionally links a new case to an older case, including after the 30-day reopening window. Do not copy messages or grant access through the link. Same requester and context compatibility must be checked; backend rejects self-links/cycles and unauthorized links. Original case remains RESOLVED.
- Text-only immutable messages for MVP; no editing/deletion, attachments, typing indicators, realtime WebSocket, or read receipts per individual staff member.

## J2. Canonical logical tables

`support_cases`:

```text
id UUID PRIMARY KEY
requester_user_id UUID NOT NULL REFERENCES users(id)
case_scope EVENT_SUPPORT | PLATFORM_SUPPORT NOT NULL
event_id UUID NULL REFERENCES events(id)
order_id UUID NULL REFERENCES orders(id)
ticket_id UUID NULL REFERENCES tickets(id)
previous_case_id UUID NULL REFERENCES support_cases(id)
category TEXT NOT NULL
custom_subject TEXT NULL
status OPEN | IN_PROGRESS | WAITING_FOR_CUSTOMER | RESOLVED NOT NULL
assigned_to_user_id UUID NULL REFERENCES users(id)
escalated_to_platform BOOLEAN NOT NULL DEFAULT FALSE
resolved_at TIMESTAMPTZ NULL
last_message_seq BIGINT NOT NULL DEFAULT 0
requester_last_read_seq BIGINT NOT NULL DEFAULT 0
support_last_read_seq BIGINT NOT NULL DEFAULT 0
requester_unread_notified BOOLEAN NOT NULL DEFAULT FALSE
support_unread_notified BOOLEAN NOT NULL DEFAULT FALSE
requester_notice_generation BIGINT NOT NULL DEFAULT 0
support_notice_generation BIGINT NOT NULL DEFAULT 0
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

- `EVENT_SUPPORT` requires event_id; `PLATFORM_SUPPORT` permits nullable event_id. `order_id`/`ticket_id` must refer to the same event when supplied, and to a requester-authorized context. Use composite ownership FKs where feasible and mandatory transactional checks elsewhere.
- Read positions are side-wide, NOT per staff user. `0 <= side_last_read_seq <= last_message_seq`; generation counters are nonnegative. This intentionally means a newly assigned employee must read the full history manually; assignment notification is independent of read position.
- `escalated_to_platform` indicates the event case has entered platform-handling authority, not a new case scope; do NOT overwrite `case_scope` or discard original event association. Platform Admin may return an escalated case to event support with an audited, authorized action; revalidate eligible assignee and queue. Escalation reasons/permissions follow approved agreements and platform policy; do not invent automatic escalation approvals.
- Status `RESOLVED` iff `resolved_at` is non-null. The most recent resolution timestamp is stored in `resolved_at` while resolved; earlier resolutions remain in history. For an event case under platform escalation, only authorized platform personnel may perform staff-side actions until returned.

`support_messages`:

```text
id UUID PRIMARY KEY
support_case_id UUID NOT NULL REFERENCES support_cases(id)
message_seq BIGINT NOT NULL
sender_user_id UUID NOT NULL REFERENCES users(id)
client_message_id UUID NOT NULL
body TEXT NOT NULL
created_at TIMESTAMPTZ NOT NULL
UNIQUE(support_case_id, message_seq)
UNIQUE(support_case_id, sender_user_id, client_message_id)
```

- Nonempty, length-bounded, plain-text messages; escape output on rendering. The first message is inserted with case creation in the same transaction, with `message_seq=1`. Repeated client message ID returns the existing message only after verifying the original payload/author/case; a reused ID with different content is a conflict, not silent acceptance.

`support_case_history`:

```text
id UUID PRIMARY KEY
support_case_id UUID NOT NULL REFERENCES support_cases(id)
actor_user_id UUID NULL REFERENCES users(id)
action TEXT NOT NULL
old_status TEXT NULL
new_status TEXT NULL
old_assignee_user_id UUID NULL REFERENCES users(id)
new_assignee_user_id UUID NULL REFERENCES users(id)
created_at TIMESTAMPTZ NOT NULL
metadata JSONB NULL  -- sanitized, bounded, never secrets
```

- History captures case creation, claim, release, reassignment, status change, resolution, reopening, escalation, platform return, and role-revocation release. System actions are distinguished from human actors. Audit Log integration must not lose these records.
- Suggested indexes: `support_messages(support_case_id,message_seq)`; `support_cases(requester_user_id,updated_at)`; event queue `(event_id,status,assigned_to_user_id,updated_at)`; platform queue `(case_scope,escalated_to_platform,status,assigned_to_user_id,updated_at)`; `support_case_history(support_case_id,created_at,id)`. Add authorization filters to all queries.

## J3. State machine and staff assignment

- Creation: `OPEN`, unassigned; case and initial message created atomically. A staff member must explicitly click 'Take in work' before staff-side reply; viewing does not claim and sending cannot auto-claim.
- Claim: atomic conditional update from `assigned_to_user_id IS NULL`, allowed queue and active authorization, to assigned staff and `IN_PROGRESS`. Exactly one concurrent claim wins. Organizer may claim own event cases. Platform Admin claims platform cases and escalated event cases.
- Staff may set `IN_PROGRESS`, `WAITING_FOR_CUSTOMER`, `RESOLVED` where allowed; `RESOLVED -> OPEN` only by requester within 30*24 hours from `resolved_at`, evaluated using PostgreSQL current time while case is locked. No new ordinary messages to RESOLVED without valid reopen. On reopening clear `resolved_at`, preserve history; the reopened case returns to OPEN and may be claimed again if unassigned.
- Requester reply in WAITING_FOR_CUSTOMER atomically changes status to IN_PROGRESS; other requester replies are allowed in OPEN/IN_PROGRESS. When no assignee, messages remain visible in shared queue.
- Release/reassignment is audited; event Organizer can reassign own event cases, assigned staff may release to event queue, and Platform Admin can reassign platform/escalated cases. Revoke EVENT_SUPPORT role: under compatible locks and one authoritative permission check, revoke role and release all affected unfinished assignments; prevent a stale staff reply. An assigned case cannot be left with a revoked/unauthorized assignee.
- Escalation of event case can be requested by requester, Organizer or authorized Event Support. It is an audited transition of handling authority to platform, not an automatic refund or outcome. Set `escalated_to_platform=TRUE`, release previous event assignee, route to platform queue, and notify relevant parties per S-09. Return from platform restores event queue/assignment authority; never create a second ticket or copy thread.
- On all staff-side operations recheck scope, current role, event ownership, escalation authority, and case assignment. Event Admin role alone does not authorize Support.

## J4. Message order and read state

- Append transaction: lock parent case row (consistent with DL-01 when other entities are touched), check authorization/status/assignee, assign `last_message_seq + 1`, insert message and increment counter atomically; write outbox event if notification is needed. Do not call email service inside transaction. Timestamp is for display only; sequence is authoritative order.
- Read API accepts highest `message_seq` actually loaded and displayed by the client, not the current server maximum. Under case lock, validate range and authorization, update corresponding side cursor using `GREATEST(old, supplied)`. Read cursor must not move backwards or mark a newly arriving message read. Reading an Inbox notification is independent of reading Support thread.
- Unread incoming exists for requester iff a committed support-authored message has `message_seq > requester_last_read_seq`; for support iff requester-authored message has `message_seq > support_last_read_seq`. Never infer incoming unread from `last_message_seq` alone (own messages also increment it). A side-wide support cursor intentionally does not attest that every individual staff member reviewed history.
- When no assignee, queue still displays cases and last activity. No personal unread state for every potential staff member; on claim, new assignee is responsible for reviewing entire history.

## J5. Notifications and idempotency (S-09/S-11)

- Every message is stored; routine chat notifications are Inbox-only, grouped per case and recipient side per unread period. No routine email on every reply and no timers. A new unassigned case appears in shared queue without mass Inbox/email fanout.
- When first incoming unread message of a period is committed, under parent case lock set corresponding `*_unread_notified=TRUE`, increment corresponding `*_notice_generation`, and insert one durable outbox event containing `case_id`, recipient side, generation and triggering `message_seq`. Further messages while flagged produce no new notice.
- Read operation resets the flag ONLY when no committed unread incoming messages remain for that side. If a read races with append, the case lock serializes both; a read of only older messages cannot reset a newer unread period.
- Worker checks current period state before materializing Inbox. If the triggering period has been read/cleared or generation is stale, mark that outbox event safely skipped/completed without creating a stale notice. A later period has a new generation and distinct event identity. Outbox event IDs and recipient-specific UNIQUE prevent duplicates on retries. Do not use permanent UNIQUE(case_id,user_id) across all periods.
- IMPORTANT delivery race: if an outbox event is already processed into Inbox and user reads the chat afterwards, the old Inbox item may remain as history; this is not a delivery failure. To avoid a stale notice created after read, serialize worker eligibility check and Inbox insertion with the same case row lock, in a short DB transaction. If an event is intended for an assignee who has since lost authority, do not deliver it to that staff member; route assignment notice to the current assignee separately. Avoid writing sensitive chat text into generic notification payloads.
- Case claimed: Inbox + Email to requester. Reassigned: Inbox + Email to requester and newly assigned employee, subject to a valid email address and authorized staff identity. WAITING_FOR_CUSTOMER: Inbox + Email to requester. RESOLVED: Inbox + Email to requester. Reopened: Inbox + Email to currently assigned employee if any; if unassigned, visible in queue without staff mass email. Significant Platform Admin decision: Inbox + Email to affected requester. For a platform escalation/return, emit auditable status/assignment notifications to affected parties without duplicating an email for one logical action. Existing provider-neutral Notifications N-01–N-08 handles delivery/retries.
- Unread-period notifications for support side apply only to current assigned staff; unassigned queue does not email anyone. Role revocation or reassignment never grants access through an old notification.

## J6. Cross-module integrity and test obligations

- Validate that every order/ticket context belongs to the linked event and authorized requester, including ticket owner vs purchaser rules where relevant. `previous_case_id` cannot link to another user's inaccessible case; reject self/cyclic references and inconsistent context.
- Check in particular: simultaneous message append; duplicate/replayed client IDs; simultaneous claim; claim-vs-role-revoke; reassignment-vs-message-send; escalation-vs-assignee reply; reopen exactly at 30-day boundary; read-vs-append; worker-vs-read; duplicate outbox replay; new unread period after previous period; recipient role revoked before notification; initial case creation failure; context ID tampering.
- Business actions and outbox creation share one commit. Side-specific read flags, notification generation, message append and outbox enqueue share the parent-case serialization point. Do not hold PostgreSQL locks across external email calls. SQL execution, concurrency tests and production security verification remain backend responsibilities.
- No hard delete of support messages/cases in MVP. Retention, legal erasure, access to historical cases, and agreement texts remain cross-module policies to finalize for production; do not imply perpetual lawful retention.

## J7. Open integration boundaries, not new product decisions

- Confirm the exact physical event role/invitation FK names and constraints against the final consolidated schema, including `EVENT_SUPPORT` acceptance and revocation.
- Confirm canonical event/Order/Ticket composite FKs and global DL-01 ordering before final schema.sql.
- Notification policy for an unassigned escalated case is platform queue visibility; no automatic email to all Platform Admin. Support-case history and generic Audit Log must avoid double-counting the same action.
- Provider-specific email delivery and agreements/terms storage remain separate modules. S-01–S-14 and S-09 grouping behavior are approved business rules; this draft does not claim executable SQL testing.

---

# Part K — Audit Log & Organizer Event History (APPROVED A-01–A-03; physical DDL pending)

## K1. Purpose and boundaries

`audit_logs` is the single canonical cross-module journal of **significant actions and significant denied attempts**, with an event-scoped read-only projection for Organizer Event History. It does **not** replace authoritative `payments`, `refunds`, `payment_webhook_events`, `check_in_records`, `support_messages`, or `support_case_history`. The same business transition can be referenced in both an authoritative domain record and an audit entry; the domain record remains authoritative for state and money. No separate `event_history` table is required.

Event History MUST be backed by audit records for the SRS §4.16 required timeline actions; it must not rely on reconstructing an action from a mutable current-state row. Show each business action once in the timeline. Full field-by-field row versioning, rollback, and permanent compliance archival are **out of MVP**. Routine page views, searches, UI typing, every retry/poll, and ordinary transient HTTP failures are **not** general audit events.

## K2. `audit_logs` — logical schema

| Column | Type / nullability | Contract |
|---|---|---|
| `id` | UUID PK NOT NULL | Generated server-side. Immutable event identifier. |
| `event_id` | UUID NULL, FK `events(id)` | Historical event association for Event History. Required whenever a business action is attributable to an existing Event; NULL for account/platform-wide actions and pre-event applications. Historical event rows must be retained. |
| `actor_type` | `USER` / `SYSTEM`, NOT NULL | Actual actor executing the recorded action. |
| `actor_user_id` | UUID NULL, FK `users(id)` | Non-NULL iff `actor_type = USER`; NULL iff SYSTEM. Preserve referenced user records per existing retention rules. |
| `action_type` | stable application-defined string NOT NULL | Controlled action catalog in K3; never arbitrary frontend input. |
| `result` | `SUCCESS` / `DENIED`, NOT NULL | SUCCESS = the **named action** occurred; DENIED = attempted action was rejected. An application rejection is `APPLICATION_REJECTED + SUCCESS`, not DENIED. |
| `entity_type` | controlled string NOT NULL | Primary affected entity class, e.g. `EVENT`, `REFUND`, `SUPPORT_CASE`. |
| `entity_id` | UUID NULL | Entity identifier where available; NULL only when a denied attempt has no safely resolved object. Generic polymorphic ID cannot have a conventional FK to every entity table; backend validates linkage and stores stable IDs. |
| `details` | JSONB NOT NULL DEFAULT '{}' | Small, version-stable, allowlisted action-specific context per K4. No entire entity dumps. |
| `created_at` | TIMESTAMPTZ NOT NULL | Authoritative server/database timestamp, not supplied by client. |

Database constraints: actor-type/user-id pairing; controlled actor/result values; `jsonb_typeof(details) = 'object'`. Index `(event_id, created_at DESC, id DESC)` for timeline and `(entity_type, entity_id, created_at DESC)` for investigations; add actor/action indexes only if justified by actual queries. Immutable audit entries: no normal user/Organizer write APIs; only privileged backend audit writer inserts; do not expose ordinary UPDATE/DELETE. `created_at` ordering is a presentation order, not proof of cross-transaction causal order.

## K3. Required significant action catalog and sources

Each listed **action occurrence** MUST have an audit record, even if a domain history table also records its detailed state. An existing domain history is not a substitute for the required Event History entry. Avoid duplicate audit entries for a single logical transition.

| Area | Required action types (illustrative stable names) | Entity / source of authoritative details |
|---|---|---|
| Event applications and moderation | `EVENT_APPLICATION_SUBMITTED`, `EVENT_APPLICATION_APPROVED`, `EVENT_APPLICATION_REJECTED`, `EVENT_CHANGE_REQUEST_APPROVED`, `EVENT_CHANGE_REQUEST_REJECTED`, `EVENT_CANCELLATION_REQUESTED`, `EVENT_CANCELLATION_APPROVED`, `EVENT_CANCELLATION_REJECTED` | Application/change/cancellation request tables; link Event where one exists. |
| Event lifecycle and material edits | `EVENT_PUBLISHED`, `EVENT_UNPUBLISHED`, `EVENT_CANCELLED`, `EVENT_COMPLETED`, `TICKET_PRICE_CHANGED`, `TICKET_CAPACITY_CHANGED`, `TICKET_TYPE_AVAILABILITY_CHANGED`, `EVENT_MATERIAL_DETAILS_CHANGED` | Events and approved changes. Record actual applied transitions, not just approval. |
| Orders and payments | `ORDER_CONFIRMED`, `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED_FINAL` | Orders/payments. A provider UNKNOWN or intermediate retry is not a false final failure; consult provider records. |
| Refunds | `REFUND_REQUESTED`, `REFUND_APPROVED`, `REFUND_REJECTED`, `REFUND_SUCCEEDED`, `REFUND_FAILED_FINAL`, `REFUND_EXCEPTION_DECIDED` | Refund request, refund attempt, decision and payment history. Never infer FAILED_FINAL from timeout/UNKNOWN. |
| Tickets and check-in | `TICKET_INVALIDATED`, `CHECK_IN_SUCCEEDED`, `CHECK_IN_REVERSED`, `CHECK_IN_DENIED_SIGNIFICANT` | Tickets/check-in records and attempts; record significant denied scans with sanitized reason and safe ticket reference where resolvable. |
| Promotions | `CAMPAIGN_CREATED`, `PROMO_CODE_CREATED`, `PROMO_CODE_DISABLED`, `PROMO_CODE_REENABLED` | Campaigns/promo codes. Individual redemptions remain authoritative in `promo_redemptions`; do not invent promo-edit actions forbidden by approved PC rules. |
| Staff and invitations | `EVENT_STAFF_INVITED`, `EVENT_STAFF_INVITATION_ACCEPTED`, `EVENT_STAFF_INVITATION_DECLINED`, `EVENT_ROLE_ASSIGNED`, `EVENT_ROLE_REVOKED` | Event role/invitation records. No Staff Pass feature. |
| Paid Sales Activation | `PAID_SALES_APPLICATION_SUBMITTED`, `PAID_SALES_APPLICATION_APPROVED`, `PAID_SALES_APPLICATION_REJECTED`, `ACTIVATION_FEE_PAID`, `PAID_SALES_ACTIVATED`, `PAID_SALES_SUSPENDED`, `PAID_SALES_RESTORED` | Activation/fee and moderation records. |
| Support | `SUPPORT_CASE_CREATED`, `SUPPORT_CASE_CLAIMED`, `SUPPORT_CASE_REASSIGNED`, `SUPPORT_CASE_RELEASED`, `SUPPORT_CASE_STATUS_CHANGED`, `SUPPORT_CASE_ESCALATED`, `SUPPORT_CASE_RETURNED_TO_EVENT` | `support_cases`, `support_case_history`. Do not duplicate each chat message. |
| Platform administration and security | `USER_SUSPENDED`, `EVENT_SUSPENDED`, `MODERATION_DECISION_RECORDED`, `PROTECTED_ACTION_DENIED`, `PROTECTED_RESOURCE_ACCESS_DENIED` | Relevant administration records; only significant, reliably identified denied attempts, not all HTTP 4xx. |

The catalog is the **minimum** for the approved flows, not permission to invent new product workflows. When an existing module has additional approved consequential state transitions, add an explicit audited action during integration. For SRS §4.16, Event History MUST include publication/cancellation, price/capacity changes, refunds, promo creation/disable, support status changes, check-ins and reversals. Keep check-in denial attempt evidence even if the final specialized scan-attempt storage is settled later; do not claim every arbitrary invalid QR can be linked to an Event.

## K4. Action-specific `details` contract

`details` MUST be constructed on the backend using a **per-action allowlist**, validated before insert. Empty `{}` is allowed where the action and linked entity convey all needed context. Values reflect the state **at action time**. Do not accept arbitrary client-provided JSON. Minimal examples:

| Action | Allowed / expected details | Forbidden |
|---|---|---|
| `TICKET_PRICE_CHANGED` | `ticket_type_id`, `old_price_minor`, `new_price_minor` (integer tiyn) | Full ticket or attendee snapshot |
| `TICKET_CAPACITY_CHANGED` | `ticket_type_id`, `old_capacity`, `new_capacity` | Entire seat layout dump |
| `EVENT_APPLICATION_REJECTED` | `reason_code` and safe brief reason when policy permits; authoritative request retains full reason | Sensitive moderation evidence |
| `PROMO_CODE_DISABLED` / `PROMO_CODE_REENABLED` | `promo_code_id`, `old_is_active`, `new_is_active` | Private campaign token / invite token |
| `CHECK_IN_REVERSED` | `check_in_record_id`, safe `reason_code` | QR secret/payload |
| `CHECK_IN_DENIED_SIGNIFICANT` | `reason_code`, safe resolved ticket reference if known | Raw scanned QR, untrusted payload, personal identity dump |
| `SUPPORT_CASE_STATUS_CHANGED` | `old_status`, `new_status` | Chat text |
| `EVENT_ROLE_REVOKED` | `role`, `affected_user_id` | Password, token, email secrets |
| `REFUND_SUCCEEDED` | `refund_id` and safe result category, if needed | Payment credentials, provider secrets |

Other action types use `{}` unless the event timeline or investigation requires a **small specified immutable fact**. All descriptions for UI are rendered from `action_type`, safe `details` and linked authorized entities; do not store mutable free-form prose as an audit truth. Never store passwords, refresh/invite tokens, full IIN/BIN, full payout IBAN, card data, raw webhook payloads, or confidential support correspondence in `details`.

## K5. Write contracts, denial and deduplication

1. **Successful DB state change:** insert its audit row in the same PostgreSQL transaction as the authoritative change; failure to insert audit must roll back that change. An approved request and the later application of a change are distinct actions only if both actually occur.
2. **Asynchronous external outcome:** record the audit row in the transaction that commits the authoritative verified state transition, not at external HTTP request initiation or unverified callback arrival. Provider `UNKNOWN` stays unresolved per CR-15B; do not audit a false final success/failure.
3. **Denied attempts:** a denied action may roll back its attempted mutation. The denial log therefore needs a **separate committed transaction**, with sanitized safe context, after the authorization/business check. Never insert the denial in a transaction destined to roll back. Distinguish meaningful prohibited operations from ordinary validation mistakes and repeated automated retries. Database unavailability can prevent this logging; do not claim an impossible absolute guarantee.
4. **Idempotency:** repeated delivery of one business event or webhook must not create repeated `*_SUCCEEDED` records. Prefer audit insertion only on the real, locked state transition; if necessary use a stable event/operation key or an explicit idempotency rule at integration time. Separate deliberate denied attempts can each be logged. A plain `UNIQUE(action_type, entity_id)` is **wrong** for actions legitimately repeated over time (e.g. suspend/restore, check-in/reversal).
5. **System actor:** `SYSTEM` indicates backend-executed automatic transition. Human initiator remains traceable in the authoritative initiating request/record (e.g. Refund Request), not copied into every audit row. Do not trust callback-supplied initiator IDs.
6. **Concurrent access:** use the module's approved transaction/locking order DL-01; audit insertion must not introduce a new inconsistent locking order. Do not hold DB locks while waiting for an external provider.
7. **Data lifetime:** do not hard-delete retained referenced business history in ways that make an audit record meaningless. Production retention/privacy rules remain an explicit external policy dependency, not an invented indefinite retention promise.

## K6. Read-only access and Organizer Event History

- Backend supplies Event History from `audit_logs WHERE event_id = :event_id`, with **server-side** authorization and filtering by visible action categories. Organizer sees only events they own/manage and permitted entries; Platform Admin may see broader moderation/investigation entries. Event Admin and Event Support see only their specifically authorized operational views, not unrestricted raw audit access. Attendees do not receive a general audit-log browser.
- Read-only history supports date-range and activity-type filters; paginate in stable `(created_at DESC, id DESC)` order. Use stable action IDs to avoid double rendering; do not merge raw domain history into the same timeline as a second copy of an audited action.
- Each visible entry must display timestamp, acting user or `SYSTEM`, action, affected entity, and a short localized description (SRS §4.16). When underlying details are confidential, show a safe summary or hide the entry; do not leak `details` by returning raw JSON to the Organizer UI.
- Detail links must reauthorize access to the target object; `entity_id` is not a capability grant. A historic event association must not automatically expose an unrelated user's personal data.

## K7. Required backend acceptance checks / remaining integration dependencies

- Event publication/price edit/refund success/check-in/reversal and support status change: verify business state and audit commit or roll back together.
- Repeated webhook/reconciliation: one true financial transition produces one audit event; UNKNOWN does not become FAILED_FINAL on timeout.
- Denied event edit and forbidden support access: no unauthorized mutation; denial audit persists after rollback when DB available.
- Concurrent duplicate requests: no false repeated success entries; legitimate repeated status changes remain individually traceable.
- Event History correctly filters by event/date/type and excludes internal Platform Admin details; staff role revocation immediately removes access.
- Verify no secret token, full bank data, QR payload or chat content leaks through `details`, error logs or history APIs.
- Ensure each action catalog item is mapped to a concrete authoritative transition and event association during integrated DDL implementation; in particular settle invalid QR scan evidence and pre-event application visibility without inventing Event IDs.

**Scope:** Part K specifies the approved logical audit architecture and backend obligations. Exact integrated PostgreSQL DDL, cross-module SQL execution and integration tests are not claimed complete.


---

# Part L — Consolidated cross-domain decisions, Analytics, Admin controls and delivery gates

> **Precedence:** This Part provides a cross-domain index of owner-approved decisions. The same decisions have been synchronized into the corresponding earlier sections; the detailed domain contracts remain binding. A remaining OPEN item is not permission for backend to invent product behavior.

## L1. Decision register

| ID | Status | Contract |
|---|---|---|
| A01 | APPROVED | DL-01 in §E7 is the canonical conceptual lock order. Part H §H7 follows Event → inventory → Promo Code → Order → Reservation. No lock-all-tables requirement. |
| A02 | APPROVED | EVENT_SUPPORT is an independent event-scoped role; `event_staff_invitations` supports EVENT_ADMIN and EVENT_SUPPORT through the same invitation flow. |
| AN-01 | APPROVED | Dashboard `sold` means currently admission-entitled Tickets (`VALID` or `CHECKED_IN`); historical ever-issued count is separate. Inventory occupancy and currently purchasable availability are distinct. |
| AN-02 | APPROVED | Gross/discount/collected/refunded/net and estimated proceeds are distinct financial metrics; never describe estimates or sandbox transactions as real payout. |
| AN-03 | APPROVED | Historical confirmed sales remain counted after refund; current occupancy excludes released/refunded inventory according to approved seat/GA rules. |
| ED-01 | APPROVED | Duplicate Event creates a prefilled new `event_applications(DRAFT)`, not an approved `events` row. Standard submission and Platform Admin approval remain mandatory. |
| ADM-01 | APPROVED | Platform Admin suspension independently blocks new sales and Check-in without cancelling Tickets; refund/reconciliation/history remain available. |
| ADM-02 | APPROVED | MVP activation fee is backend-configured at 30,000 KZT per Event and frozen in the fee-payment snapshot; no Admin-editable tariff UI or tariff table. |
| ADM-03 | APPROVED | Organizer selects a predefined Venue; Platform Admin may provision Venue records via authorized administration/seed workflow; no user Request New Venue moderation in MVP. |

## L2. Event staff role and invitation integration — A02

- `event_user_roles` supports `ORGANIZER | EVENT_ADMIN | EVENT_SUPPORT`. Composite uniqueness must allow the same `(event_id,user_id)` to hold EVENT_ADMIN and EVENT_SUPPORT concurrently; enforce one responsible ORGANIZER per Event (a partial unique index on Event for ORGANIZER plus atomic approval creation). Do not infer Event Support from Event Admin or vice versa.
- `event_staff_invitations` replaces the older `event_admin_invitations` name; use `(event_id, invited_user_id, invited_role)` for active invitation uniqueness and acceptance checks. A `PENDING` invitation with expired `expires_at` is ineffective even though status remains PENDING. Expiry cannot be expressed by a time-dependent partial index; use Event-first serialized backend validation and a compatible uniqueness strategy for competing active PENDING rows. If stale PENDING rows block re-invitation, backend must explicitly revoke/close the stale invitation under locks before inserting a replacement.
- Acceptance inserts only the invited role and is idempotent; revocation of EVENT_SUPPORT releases unfinished case assignments atomically and prevents stale Support writes. Revocation of EVENT_ADMIN prevents further scans and does not remove Support role. Audit and notification references use the generalized table.
- Physical DDL must update all FK/index and query references to the renamed table; migrations from a deployed older schema are a separate backend task.

## L3. Event duplication — ED-01

- An authenticated authorized Organizer may use an existing Event as a template to create a **new** `event_applications` row with `status=DRAFT`, new `id` and `application_number`, `applicant_user_id` equal to the current actor. The original Event is not mutated.
- Prefill only reusable moderated application content: title, description, venue reference and reviewed venue snapshot refreshed against the selected current Venue, categories, eligible image storage keys, seating mode, layout reference and suitable responsible-contact values. The Organizer must review/edit these values. Event dates/start/end must be newly selected; both new Organizer agreement acceptances and submission timestamp are unset. Backend revalidates Venue/Layout availability and image storage ownership.
- No `events` row, event roles, paid activation, ticket types, seat assignments, Orders, Payments, Reservations, Tickets, Refunds, Check-ins, Support Cases, staff invitations, promo holds, redemptions or Audit history is cloned. Reusable ticket configuration may be displayed as a frontend template after approval, but requires fresh explicit creation/validation for the new Event; do not silently copy active inventory.
- Submitting this application uses ordinary DRAFT→PENDING checks and Platform Admin approval creates the new Event(DRAFT) and responsible Organizer atomically. Existing anti-self-approval rule still applies.

## L4. Administrative Event suspension — ADM-01

Add to `events` (not to the Event lifecycle enum):

```text
is_suspended BOOLEAN NOT NULL DEFAULT FALSE
suspended_at TIMESTAMPTZ NULL
suspension_reason TEXT NULL
```

- `is_suspended=TRUE` requires a non-null `suspended_at` and trimmed nonempty `suspension_reason`; when not suspended, `suspended_at` may be NULL. Historical suspension/restoration actions and reasons remain in `audit_logs`; a restored Event may clear current suspension fields without erasing audit.
- Only Platform Admin may suspend/restore. Serialize on Event lock, recheck lifecycle and current state, write one audit record and durable notification intent atomically. Repeat of an already applied action is idempotent, not a second transition. Restoration does not resume separately PAUSED Ticket Types or SUSPENDED Paid Sales Activation.
- While suspended, reject creation of new Reservations, Orders, buyer Payments, free checkout confirmations/new issuance, and Check-in/reversal-to-valid-admission. Preserve previously issued Ticket statuses, purchase history and user access to their own records. No automatic ticket cancellation or refund.
- RF-01: a verified successful charge with no issued Tickets because Event suspension blocks issuance is represented by `refund_requests.source = EVENT_SUSPENSION` and an automatically APPROVED mandatory full-Order Refund Request, with the ordinary approved execution FSM. Financial operations already initiated before suspension still require safe provider resolution, reconciliation and existing refund obligations; suspension alone is not a bank failure or permission to free PROTECTED inventory. Ticket issuance after a pre-suspension financial success must follow the existing confirmed-payment recovery obligations while preserving the no-new-issuance suspension rule; **owner-approved outcome: if the charge is independently verified as successful while issuance is prohibited by suspension and no tickets were issued, do not issue tickets; persist a mandatory full SYSTEM refund obligation and process it through the existing Refund Service**. Unknown bank outcome stays unresolved and is reconciled; do not infer success/failure from timeout. A late success must never silently confirm an invalid admission. The backend must enforce one obligation per affected Order, no duplicate refund attempts outside approved FSM, and must preserve protected inventory until safe financial resolution.
- Check-in must read current Event suspension under Event-first locking, not trust cached status. Resumption allows future check-ins only if all other approved Event/Ticket/refund/time eligibility checks pass.
- A free checkout and the administrative suspension both serialize through the Event lock. If free confirmation/issuance committed first, the issued ticket remains valid but Check-in is blocked during suspension; if suspension commits first, free confirmation/issuance is denied. Do not create a refund for a zero-value free Order.
- For paid operations, distinguish an already-issued confirmed Order (no automatic refund merely due to suspension) from an unresolved in-flight charge without issued tickets (mandatory system refund after verified success). Preserve Order/Payment historical truth and represent the refund obligation through approved Refund entities; no invented Payment status or false ticket issuance. Recheck Event suspension under Event-first locking at the issuance decision point.

## L5. Organizer Analytics — AN-01–AN-03

- The backend owns canonical metrics. All monetary amounts are integer tiyn, KZT display conversion is presentation only. Never aggregate a multi-join of Order Items × Payments × Tickets × Refunds without pre-aggregating at the authoritative entity level. Free Orders contribute ticket counts, but zero to collected cash.
- `historical_confirmed_tickets`: count of tickets issued from confirmed Orders, including later CANCELLED/REFUNDED; `sold`: count of Tickets currently `VALID` or `CHECKED_IN`. A refunded seat resold later increases historical count twice, but current occupied inventory only once. A CHECKED_IN Ticket may continue to consume inventory under existing rules; do not equate inventory occupancy with the `sold` display metric.
- `capacity`: GA `events.ga_capacity`; Assigned Seating count enabled `event_seats` with assigned type. `inventory_occupied`: issued Tickets still consuming inventory plus effective unexpired ACTIVE and all PROTECTED Reservation holds, excluding CONVERTED holds. `remaining_inventory = max(0, capacity - inventory_occupied)` is physical availability, not necessarily purchasable supply. Purchasable availability also checks ticket-type limits/assignments, sales windows, pause, paid activation, suspension and Event lifecycle.
- `gross_sales_minor`: frozen `orders.subtotal_minor` across confirmed paid Orders, before discounts; `discounts_minor`: frozen `orders.discount_minor` on those Orders; `collected_minor`: successful buyer Payment amount, counted once per successful Order; `refunded_minor`: only verified successful financial Refund amounts, counted once; `net_revenue_minor = collected_minor - refunded_minor`. Estimated organizer proceeds additionally subtract estimated processing fees with an explicit fee/refund adjustment policy; they are not verified settlements. Do not count activation fees as ticket revenue.
- By Ticket Type, aggregate frozen `order_items` subtotals and line discounts, not mutable ticket prices. Campaign attribution requires actual successful `promo_redemptions`, not QR visits. Order/ticket/refund aggregation must avoid duplicate amounts on joins.
- **Time filter:** historical sales are attributed to `orders.confirmed_at` (not creation); financial collections to successful Payment confirmation time, and Refunds to verified success time. These are different event-time series and must be labelled accordingly. A net financial period is collections recognized in the selected period minus refunds recognized in that period; it can be negative. All-time event totals use full history. Time-zone conversion uses Event timezone for date buckets, UTC instants for storage/filter boundaries.
- Attendance counts distinct Tickets with effective Check-in; historical reversals remain visible in history but are not current attendance. `absent` is eligible issued Tickets without effective Check-in, subject to the same reporting cutoff and refund rules. If denominator is zero, return a documented null/zero display convention consistently rather than dividing by zero.
- SRS-required filters: Event, date range and Ticket Type; authorization is event-scoped. Do not require GA4 for base MVP. Prefer indexed PostgreSQL aggregations; expensive reporting must not block checkout transactions. No analytics materialization table is required initially.

## L6. Event History and Audit integration

- Part K `audit_logs` is the only generic audit/event-timeline source. `support_case_history`, `check_in_records`, provider journals and Refund records remain domain-specific authoritative history, not second generic timeline rows.
- Render one timeline entry per actual significant action, with actor/time/type/target and sanitized description. Use `audit_logs(event_id, created_at DESC, id DESC)` with server-side event role checks and filters. No ordinary user UPDATE/DELETE of audit.
- `EVENT_STAFF_INVITED`, `EVENT_ROLE_ASSIGNED` and `EVENT_ROLE_REVOKED` must include EVENT_SUPPORT as well as EVENT_ADMIN; action-specific role values must reflect actual role. `EVENT_SUSPENDED` and `EVENT_SUSPENSION_LIFTED` are additional required significant actions under ADM-01.

## L7. Remaining MVP scope and external gates

- Calendar Export (.ics, stable UID, time-zone-aware event fields and cancellation updates) can be generated from current Event data and stable `events.public_id`/ID without new calendar tables. It is a **bonus/stretch feature in SRS §8**; do not present it as required MVP or invent calendar write permissions.
- ADM-02 APPROVED: keep activation fee at backend-configured 30,000 KZT, snapshot amount per fee attempt; no Admin fee editor/tariff table for MVP. ADM-03 APPROVED: choose predefined Venue; administrative provisioning or seed data is permitted, but no user-submitted New Venue moderation flow in MVP. Existing Platform Admin review/search/Support and suspension obligations still apply.
- Required backend handoff: implement PostgreSQL constraints plus transactional service checks for cross-row and cross-table invariants, idempotent external operations, authorization, lock order, outbox, audit and reconciliations. Backend team must execute migrations, SQL constraint tests, two-session concurrency tests, payment-provider sandbox/simulation tests and email integration tests. This document is not a substitute for those tests.
- Before calling `database.md` + `schema.sql` a complete team handoff, reconcile exact physical DDL, enums, composite FKs, status constraints, all referenced column names, SRS coverage and the explicit OPEN decisions. Do not label this review as an executed schema.


---

# DDL audit status — v0.9 static review (non-normative verification record)

**Reviewed artifact:** `BiletFlow_schema_v0.2_static_review.sql`, based on v0.1 candidate. It contains 52 `CREATE TABLE` statements. The local static checker confirmed balanced parentheses/SQL single quotes, distinct table and index names, and that referenced FK *table names* exist. These checks do **not** parse PostgreSQL grammar, verify referenced columns/unique keys, or execute DDL.

**Verified changes:** Payment state-combination and webhook checks use NULL-safe `IS TRUE`; Refund Request execution finalization is NULL-safe; Ticket-to-Order-Item FK now includes Event and Ticket Type; additional supporting indexes added. No Payment/Refund FSM transition semantics were intentionally changed.

**Still blocking a claim of complete database handoff:**

1. Execute the entire schema on a clean PostgreSQL 16 instance; check all DDL/FK/index definitions and transaction rollback. This environment did not have PostgreSQL server/client available.
2. SQL-only constraints do not enforce exact Ticket count per Order Item, Organizer-initiated one historical financial attempt per Refund Request, five SYSTEM attempts, cross-request Refund exclusivity, immutable historical snapshots, Event-specific inventory capacity, or FSM transitions. Backend transactions and/or explicitly reviewed triggers are required, as already mandated in Parts B–E.
3. Confirm the `refund_requests.source` values and provider-operation journal/dispatch identity with the authoritative Refund domain contract before calling this production-ready; `EVENT_SUSPENSION` is the approved added source.
4. Validate physical foreign-key membership and ownership for all paths, including `support_cases` linked Order/Ticket, `event_seats` physical layout compatibility, and `promo_holds`/`promo_redemptions` matching Order's Promo Code.
5. Verify the structured `refund_policy` JSONB schema, acceptance of both current Event Application agreements at submission, effective staff permissions, and state transition immutability in the service layer.
6. Validate Halyk provider mapping, evidence finality, durable dispatch/reconciliation and retry behavior in sandbox. Never interpret timeout/UNKNOWN as final failure.
7. Run two-session concurrency tests for GA/Assigned Seating, first Ticket issuance, suspension, role revocation, refund/check-in, webhook replay and idempotent worker recovery. Backend team owns execution and integration tests.

**Handoff classification:** integration candidate for backend review, not `v1.0 FINAL` and not evidence of executable/production-safe SQL.
