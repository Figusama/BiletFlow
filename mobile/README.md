# BiletFlow Mobile

React Native (Expo) client for BiletFlow. It talks to the existing FastAPI backend through the same API as the website.
Nothing in `backend/` or `frontend/` is changed by this folder.

## What the app does

Tabs depend on the account role:

| Tab | Who sees it | What it does |
|---|---|---|
| Discover | everyone | Public events, ticket types, buying tickets |
| Tickets | everyone | Own tickets with QR codes |
| Inbox | everyone | Notifications and event team invitations (accept / decline) |
| Check-in | users with an event role | Assigned events, QR scan, undo with reason, attendee search, counters |
| Admin | `PLATFORM_ADMIN` only | Review queues, users, events (see below) |
| More | everyone | Website pages in a WebView, sign out |

**Buying tickets (general admission events).** Select tickets, a 15-minute reservation starts, optional promo code,
order, payment. Free tickets are issued at once. In the local environment the payment simulator is completed inside the app
("Pay successfully" / "Decline"). A real payment page (Halyk) opens in a WebView.
Events with assigned seats are bought on the website (opened from the event page).

**Platform Admin.** Queues: event applications, change requests, paid-sales requests, event cancellations, refunds
(Approve / Reject with a reason, Retry payout). Users: suspend / restore. Events: suspend with a reason / restore.

**Website pages in the app.** Organizer pages (`/organizer/events`, `/organizer/events/new`), help and registration open in a WebView.
The website keeps its own login, so you sign in there once.

## Run it

Requirements: Node 20+, Expo Go on a phone, the backend and a **local** database running, phone and computer on the same Wi-Fi.

1. Backend (repository root, virtualenv active): `uvicorn backend.main:app --host 0.0.0.0 --port 8000`.
   Local data: see [scripts/README.md](scripts/README.md).
2. Website (only needed for WebView pages): `cd frontend`, then
   `$env:VITE_API_URL="http://<COMPUTER_IP>:8000"; npm run dev -- --host` (PowerShell).
   In the backend `.env`, `FRONTEND_URL` must be the website origin (CORS).
3. App:
   ```
   cd mobile
   npm install
   copy .env.example .env.local     # then put the computer's IPv4 address into EXPO_PUBLIC_HOST
   npx expo start -c
   ```
   Open the QR code in Expo Go. When the Wi-Fi network changes, only `EXPO_PUBLIC_HOST` in `.env.local` has to change.

Settings (`.env.local`, never committed): `EXPO_PUBLIC_HOST` (computer IP), optional `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL`.

## Tests

`npm test` (Jest, jest-expo, Testing Library). They cover request paths and bodies, response mapping, validation rules,
role-based tabs and the purchase logic (payment polling, idempotency header, URL resolution) with the API mocked.
They do not call a real server. See [docs/MANUAL_CHECK.md](docs/MANUAL_CHECK.md) for the manual check with a local backend.

## Structure

```
App.tsx                      navigation and auth gate
src/env.ts                   API / website addresses from .env.local
src/config.ts                website pages opened in the WebView
src/theme.ts, format.ts      colors, date and price formatting
src/api/client.ts            fetch wrapper: token, refresh on 401, 204 handling
src/api/real.ts              check-in, events, tickets
src/api/checkout.ts          reservation, promo, order, payment
src/api/inbox.ts, admin.ts   notifications, invitations, platform admin
src/components/              Button, Badge, TabBar, PromptModal, ResultCard, ...
src/screens/                 one file per screen
src/__tests__/               Jest tests
scripts/                     local test data (local database only)
docs/                        SRS coverage, API used by the app, manual check
```

## Security notes

- No secrets in the code. Tokens are stored in the device secure storage (Expo SecureStore).
- `.env.local` is ignored by Git. Never put database or mail credentials in this folder.
- The scripts in `scripts/` work only with a local database and refuse anything else.
- The payment simulator is available only in the local environment; no real money moves.

## Known limits

See [docs/SRS_COVERAGE.md](docs/SRS_COVERAGE.md). Main ones: no native seat map, refunds for buyers, Support chat, profile editing,
and push notifications yet; the attendee name entered on the website is not part of the order API, so tickets carry the account name.
