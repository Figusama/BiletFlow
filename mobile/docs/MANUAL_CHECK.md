# Manual check with a local backend

Prepare the local data (see `scripts/README.md`), start the backend and the app (see the README), then:

1. `buyer@test.kz`: tabs Discover, Tickets, Inbox, My events, More (no Admin). Discover, Seed Check-in Test, one "Free entry", Continue, Get tickets: a new ticket with a QR appears in Tickets.
2. Promo code `SEEDPROMO` on a paid ticket shows a discount (needs a paid ticket type with paid sales activated).
3. `platform@test.kz`: the Admin tab appears. Users: suspend and restore `buyer@test.kz`. Events: suspend and restore the seed event with a reason.
4. `admin@test.kz`: My events, the seed event, scan the printed QR payloads: valid, then Already used; undo from Search; refunded, cancelled and unknown codes are rejected.
5. More, Organizer: my events opens the website page; sign in there once.
6. My events, select an event, Manage event: status, ticket types, sales (organizer account), Publish / Unpublish on a draft or published event.
7. Paid ticket (needs a published event with a paid ticket type and active paid sales): Discover, event, Continue, Pay. With the simulator choose Pay successfully; with a real provider the payment page opens and the app returns to the order by itself.
