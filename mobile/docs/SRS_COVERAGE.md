# What is implemented in the mobile app

Statuses: **Native** (screens in the app), **WebView** (the website page opens inside the app), **Not yet**.
The "SRS" column is for the requirement numbers; fill them in from the SRS document.

| Area | Status | Notes | SRS |
|---|---|---|---|
| Sign in, token refresh, sign out | Native | `/auth/token`, `/auth/refresh`; token in SecureStore | |
| Registration, e-mail confirmation, password reset | WebView | registration page of the website | |
| Browse public events and ticket types | Native | Discover, event page | |
| Buy tickets, general admission | Native | reservation, timer, promo code, order, payment | |
| Buy tickets, assigned seats | WebView | seat map is on the website | |
| Payment: simulator | Native | decision inside the app | |
| Payment: Halyk | WebView | payment page from the backend | |
| My tickets with QR | Native | `/tickets/mine` | |
| Event Admin check-in: scan, undo with reason, search, counters | Native | §2.1, §13.2 | §2.1, §13.2 |
| Notifications and staff invitations | Native | Inbox | |
| Platform Admin: event applications | Native | approve / reject | |
| Platform Admin: change requests, paid sales, cancellations, refunds | Native | approve / reject, retry payout | |
| Platform Admin: users and events (suspend / restore) | Native | | |
| Organizer: my events, new application | WebView | `/organizer/events`, `/organizer/events/new` | |
| Organizer: promo codes, team, analytics | Not yet | API exists | |
| Refunds and cancellation by the buyer | Not yet | API exists | |
| Support cases | Not yet | API exists | |
| Profile (name, password, delete account) | Not yet | API exists | |
| Push notifications | Not yet | Inbox inside the app only | |

Backend limits seen from the app: the order API accepts only a promo code (no attendee names),
and paid sales must be activated for an event before paid tickets can be bought.
