# Backend API used by the app

The app calls only existing endpoints. If one of them changes (path, field, status value), the matching screen stops working.
Please tell the mobile owner before changing them.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/token` (form), `POST /auth/refresh`, `GET /users/me` |
| Events and tickets | `GET /events/`, `GET /events/{ref}`, `GET /events/mine`, `GET /events/{id}/manage`, `GET /events/{id}/ticket-types`, `GET /events/{id}/ticket-types/manage`, `GET /events/{id}/analytics`, `GET /events/{id}/paid-sales`, `POST /events/{id}/publish|unpublish`, `GET /tickets/mine` |
| Check-in | `POST /checkin/scan`, `POST /checkin/tickets/{id}/undo`, `GET /checkin/events/{id}/attendees`, `GET /checkin/events/{id}/stats` |
| Purchase | `POST /events/{id}/reservations`, `DELETE /reservations/{id}`, `POST /promo-codes/validate`, `POST /reservations/{id}/order`, `GET /orders/{id}`, `POST /orders/{id}/cancel`, `POST /orders/{id}/payments` (header `Idempotency-Key`), `POST /payments/simulator/{id}/decision` |
| Inbox | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/read-all`, `GET /staff-invitations/mine`, `POST /staff-invitations/{id}/accept`, `POST /staff-invitations/{id}/decline` |
| Platform Admin | `GET /admin/event-applications`, `/admin/change-requests`, `/admin/paid-sales/requests`, `/admin/cancellation-requests`, `/admin/refund-requests`, `/admin/users`, `/admin/events`; approve / reject of each queue; `POST /refund-requests/{id}/approve|reject`, `POST /admin/refund-requests/{id}/retry`, `POST /users/{id}/suspend|unsuspend`, `POST /admin/events/{id}/suspend|restore` |

Field names the app relies on include: `personal_role`, `qr_payload`, `requires_payment`, `payment_url`, `is_simulated`,
`expires_at`, `ticket_ids`, and the reject reason fields `review_comment`, `reason`, `comment` (they differ per queue).
