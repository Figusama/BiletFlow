import { Attendee, EventItem, MyTicket, PublicEvent, ScanResult, TicketTypeItem } from '../types';

const events: EventItem[] = [
  { id: 'e1', title: 'Steppe Sound Festival', subtitle: 'Today · 19:00 · Barys Arena', gate: 'Gate 2', checkedIn: 842, total: 1412 },
  { id: 'e2', title: 'Campus Hackathon 2026', subtitle: '29 Nov · Expo Hall C2', gate: 'Gate 1', checkedIn: 0, total: 400 },
];

const attendees: Attendee[] = [
  { ticketId: 'BF-T-3K8P2Q', name: 'Aruzhan Serikova', seat: 'VIP · Center · Row B · Seat 6', status: 'valid' },
  { ticketId: 'BF-T-9M4R7X', name: 'Daniyar Serikov', seat: 'VIP · Center · Row B · Seat 7', status: 'valid' },
  { ticketId: 'BF-T-1Z6V0P', name: 'Timur Akhmetov', seat: 'Economy · Left · G3', status: 'refunded' },
];

const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));

export const mockApi = {
  async login(email: string, password: string) {
    await wait();
    if (!email || password.length < 4) throw new Error('Неверный email или пароль');
    return { token: 'mock-token', user: { name: 'Aruzhan Serikova', initials: 'AS' } };
  },
  async getEvents(): Promise<EventItem[]> {
    await wait();
    return events;
  },
  async scan(eventId: string, code: string): Promise<ScanResult> {
    await wait(300);
    const c = code.toUpperCase();
    if (c.includes('PROMO') || c.includes('?C=') || c.includes('CAMPAIGN'))
      return { status: 'campaign_qr', message: 'Campaign QR (promo). Ask for the admission ticket.' };
    const a = attendees.find((x) => c.includes(x.ticketId));
    if (!a) return { status: 'invalid', message: 'Ticket not found.' };
    if (a.status === 'refunded') return { status: 'refunded', message: 'This ticket no longer admits.', ticketId: a.ticketId };
    if (a.status === 'cancelled') return { status: 'cancelled', message: 'Event cancelled by organizer.', ticketId: a.ticketId };
    if (a.status === 'checked_in')
      return { status: 'already_used', message: 'Checked in 18:31 at Gate 1 by Yerlan T.', ticketId: a.ticketId, attendee: a.name, seat: a.seat };
    a.status = 'checked_in';
    events[0].checkedIn += 1;
    return { status: 'valid', message: 'Checked in just now', ticketId: a.ticketId, attendee: a.name, seat: a.seat };
  },
  async undo(eventId: string, ticketId: string, _reason?: string) {
    await wait(200);
    const a = attendees.find((x) => x.ticketId === ticketId);
    if (a && a.status === 'checked_in') {
      a.status = 'valid';
      events[0].checkedIn -= 1;
    }
  },
  async search(eventId: string, q: string): Promise<Attendee[]> {
    await wait(200);
    const s = q.trim().toLowerCase();
    if (!s) return attendees;
    return attendees.filter((a) => a.name.toLowerCase().includes(s) || a.ticketId.toLowerCase().includes(s));
  },
  async getPublicEvents(): Promise<PublicEvent[]> {
    await wait();
    return events.map((e) => ({
      id: e.id, slug: e.id, title: e.title, description: 'Demo event (mock data).', venueName: 'Barys Arena', city: 'Astana',
      startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 2 * 86400000).toISOString(),
      timezone: 'Asia/Almaty', status: 'PUBLISHED', isSuspended: false, seatingMode: 'GENERAL_ADMISSION',
    }));
  },
  async getPublicEvent(ref: string): Promise<PublicEvent> {
    return (await this.getPublicEvents()).find((e) => e.id === ref || e.slug === ref)!;
  },
  async getTicketTypes(_eventId: string): Promise<TicketTypeItem[]> {
    await wait();
    return [
      { id: 't1', name: 'VIP', kind: 'PAID', priceMinor: 2400000, saleState: 'ON_SALE', available: 12, maxPerOrder: 6 },
      { id: 't2', name: 'Standard', kind: 'PAID', priceMinor: 1200000, saleState: 'ON_SALE', available: 80, maxPerOrder: 6 },
    ];
  },
  async getMyTickets(): Promise<MyTicket[]> {
    await wait();
    return [
      {
        id: 'mt1', publicId: 'BF-T-3K8P2Q', eventId: 'e1', eventTitle: 'Steppe Sound Festival', startsAt: new Date(Date.now() + 86400000).toISOString(),
        timezone: 'Asia/Almaty', venueName: 'Barys Arena', orderNumber: 'BF-O-7Q2K9M', ticketTypeName: 'VIP', attendeeName: 'Aruzhan Serikova',
        seatLabel: 'Center · Row B · Seat 6', status: 'VALID', qrPayload: 'BFT1.k1.BF-T-3K8P2Q.mock',
      },
    ];
  },
  async getEvent(id: string) {
    return events.find((e) => e.id === id)!;
  },
};
