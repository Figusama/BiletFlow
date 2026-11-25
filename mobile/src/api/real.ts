import { BASE_URL, request } from './client';
import { Attendee, EventItem, MyTicket, PublicEvent, ScanResult, ScanStatus, TicketTypeItem } from '../types';

const RESULT_MAP: Record<string, ScanStatus> = {
  admitted: 'valid',
  already_used: 'already_used',
  cancelled: 'cancelled',
  refunded: 'refunded',
  invalid: 'invalid',
  wrong_event: 'wrong_event',
  event_cancelled: 'event_cancelled',
  event_not_active: 'event_not_active',
  event_suspended: 'event_suspended',
  campaign_qr_not_admission: 'campaign_qr',
  undone: 'valid',
};

const time = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';

function message(r: any): string {
  switch (r.result) {
    case 'admitted': return 'Checked in just now';
    case 'already_used': return r.checked_in_at ? `Checked in at ${time(r.checked_in_at)}` : 'This ticket was already used.';
    case 'cancelled': return 'The order was cancelled. This ticket doesn’t admit.';
    case 'refunded': return 'This ticket was refunded and no longer admits.';
    case 'invalid': return 'We can’t find this ticket. The QR may be damaged or not from BiletFlow.';
    case 'wrong_event': return 'This ticket is for another event.';
    case 'event_cancelled': return 'This event was cancelled by the organizer.';
    case 'event_not_active': return 'Check-in is closed: the event is not published or has already ended.';
    case 'event_suspended': return 'BiletFlow suspended this event. Don’t admit anyone; contact the organizer.';
    case 'campaign_qr_not_admission': return 'This is a Campaign QR for a promo code. It gives a discount, not entry. Ask the guest for their admission ticket.';
    default: return '';
  }
}

function seatText(r: any): string | undefined {
  const parts = [r.ticket_type_name, r.seat_label].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

async function toItem(e: any): Promise<EventItem> {
  let checkedIn = 0;
  let total = 0;
  try {
    const s = await request<any>(`/checkin/events/${e.id}/stats`);
    checkedIn = s.checked_in;
    total = s.registered;
  } catch {}
  const when = new Date(e.starts_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const st = String(e.status || '').toUpperCase();
  const note = st && st !== 'PUBLISHED' ? ` · ${st}` : '';
  return { id: e.id, title: e.title, subtitle: `${when}${e.venue_name ? ' · ' + e.venue_name : ''}${note}`, checkedIn, total };
}

const toPublic = (e: any): PublicEvent => ({
  id: e.id,
  slug: e.slug,
  title: e.title,
  description: e.description ?? '',
  venueName: e.venue_name ?? undefined,
  address: e.venue_address ?? undefined,
  city: e.venue_city ?? undefined,
  startsAt: e.starts_at,
  endsAt: e.ends_at,
  timezone: e.timezone,
  status: String(e.status),
  isSuspended: !!e.is_suspended,
  seatingMode: String(e.seating_mode),
});

const toTicket = (t: any): MyTicket => ({
  id: t.id,
  publicId: t.public_id,
  eventId: t.event_id,
  eventTitle: t.event_title,
  startsAt: t.event_starts_at,
  timezone: t.event_timezone,
  venueName: t.venue_name,
  orderNumber: t.order_number,
  ticketTypeName: t.ticket_type_name,
  attendeeName: t.attendee_name,
  seatLabel: t.seat_label ?? undefined,
  status: String(t.status).toUpperCase() as MyTicket['status'],
  checkedInAt: t.checked_in_at ?? undefined,
  qrPayload: t.qr_payload,
});

export const realApi = {
  async login(email: string, password: string) {
    let res: Response;
    try {
      res = await fetch(BASE_URL + '/auth/token', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
      });
    } catch {
      throw new Error('Нет связи с сервером. Проверьте Wi-Fi и адрес бэкенда.');
    }
    if (res.status === 401) throw new Error('Неверный email или пароль');
    if (!res.ok) {
      let d = `Ошибка ${res.status}`;
      try { d = (await res.json()).detail || d; } catch {}
      throw new Error(typeof d === 'string' ? d : 'Ошибка входа');
    }
    const data = await res.json();
    return { token: data.access_token as string };
  },

  async getEvents(): Promise<EventItem[]> {
    const list = await request<any[]>('/events/mine');
    const unique = Array.from(new Map(list.map((e) => [e.id, e])).values());
    return Promise.all(unique.map(toItem));
  },

  async getEvent(id: string): Promise<EventItem> {
    const e = await request<any>(`/events/${id}/manage`);
    return toItem(e);
  },

  async scan(eventId: string, code: string): Promise<ScanResult> {
    const r = await request<any>('/checkin/scan', {
      method: 'POST',
      body: JSON.stringify({ event_id: eventId, payload: code }),
    });
    return {
      status: RESULT_MAP[r.result] || 'invalid',
      message: message(r),
      ticketId: r.ticket_id || undefined,
      publicId: r.public_id || undefined,
      attendee: r.attendee_name || undefined,
      seat: seatText(r),
    };
  },

  async undo(_eventId: string, ticketId: string, reason: string = 'Accidental check-in') {
    await request(`/checkin/tickets/${ticketId}/undo`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason.trim().length >= 3 ? reason.trim() : 'Accidental check-in' }),
    });
  },

  async search(eventId: string, q: string): Promise<Attendee[]> {
    const rows = await request<any[]>(`/checkin/events/${eventId}/attendees?q=${encodeURIComponent(q.trim())}`);
    return rows.map((a) => ({
      ticketId: a.ticket_id,
      publicId: a.public_id,
      name: a.attendee_name,
      seat: [a.ticket_type_name, a.seat_label].filter(Boolean).join(' · '),
      status: String(a.status).toLowerCase() as Attendee['status'],
    }));
  },

  async getPublicEvents(): Promise<PublicEvent[]> {
    const list = await request<any[]>('/events/');
    return list.map(toPublic);
  },

  async getPublicEvent(ref: string): Promise<PublicEvent> {
    return toPublic(await request<any>(`/events/${encodeURIComponent(ref)}`));
  },

  async getTicketTypes(eventId: string): Promise<TicketTypeItem[]> {
    const rows = await request<any[]>(`/events/${eventId}/ticket-types`);
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      kind: String(t.kind ?? ''),
      priceMinor: Number(t.price_minor ?? 0),
      saleState: String(t.sale_state ?? ''),
      available: t.available ?? null,
      maxPerOrder: Number(t.max_per_order ?? 0),
    }));
  },

  async getMyTickets(): Promise<MyTicket[]> {
    const rows = await request<any[]>('/tickets/mine');
    return rows.map(toTicket);
  },
};
