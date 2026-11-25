jest.mock('../api/client', () => ({
  BASE_URL: 'http://test',
  request: jest.fn(),
}));

import { request } from '../api/client';
import { realApi } from '../api/real';

const req = request as jest.Mock;
beforeEach(() => req.mockReset());

describe('realApi: события и билеты покупателя', () => {
  it('getMyTickets приводит ответ сервера к MyTicket', async () => {
    req.mockResolvedValue([
      {
        id: 'u1', public_id: 'BF-T-3K8P2Q', event_id: 'e1', event_title: 'Seed Check-in Test',
        event_starts_at: '2026-11-25T10:00:00Z', event_timezone: 'Asia/Almaty', venue_name: 'Test Hall',
        order_id: 'o1', order_number: 'BF-O-SEED01', ticket_type_id: 't1', ticket_type_name: 'Free entry',
        attendee_name: 'Aruzhan Serikova', seat_label: null, status: 'VALID', issued_at: 'x', checked_in_at: null,
        qr_payload: 'BFT1.k1.BF-T-3K8P2Q.sig', pdf_url: '/tickets/u1/pdf',
      },
    ]);
    const list = await realApi.getMyTickets();
    expect(req.mock.calls[0][0]).toBe('/tickets/mine');
    expect(list[0]).toMatchObject({
      id: 'u1', publicId: 'BF-T-3K8P2Q', eventTitle: 'Seed Check-in Test', status: 'VALID',
      qrPayload: 'BFT1.k1.BF-T-3K8P2Q.sig', seatLabel: undefined, checkedInAt: undefined,
    });
  });

  it('getPublicEvents запрашивает /events/ и приводит поля', async () => {
    req.mockResolvedValue([
      {
        id: 'e1', slug: 'seed', title: 'Seed', description: null, venue_name: 'Hall', venue_city: 'Astana',
        starts_at: 'a', ends_at: 'b', timezone: 'Asia/Almaty', status: 'PUBLISHED', is_suspended: false,
        seating_mode: 'GENERAL_ADMISSION',
      },
    ]);
    const list = await realApi.getPublicEvents();
    expect(req.mock.calls[0][0]).toBe('/events/');
    expect(list[0]).toMatchObject({ id: 'e1', description: '', venueName: 'Hall', city: 'Astana', isSuspended: false });
  });

  it('getPublicEvent кодирует ссылку', async () => {
    req.mockResolvedValue({ id: 'e1', slug: 'a b', title: 'T', starts_at: 'a', ends_at: 'b', timezone: 'UTC', status: 'PUBLISHED', seating_mode: 'X' });
    await realApi.getPublicEvent('a b');
    expect(req.mock.calls[0][0]).toBe('/events/a%20b');
  });

  it('getTicketTypes подставляет значения по умолчанию', async () => {
    req.mockResolvedValue([{ id: 't1', name: 'VIP', kind: 'PAID', price_minor: 2400000, sale_state: 'ON_SALE', available: 5, max_per_order: 6 }, { id: 't2', name: 'Free' }]);
    const list = await realApi.getTicketTypes('e1');
    expect(req.mock.calls[0][0]).toBe('/events/e1/ticket-types');
    expect(list[0]).toMatchObject({ name: 'VIP', priceMinor: 2400000, available: 5 });
    expect(list[1]).toMatchObject({ priceMinor: 0, available: null });
  });
});
