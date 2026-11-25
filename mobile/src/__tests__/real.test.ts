jest.mock('../api/client', () => ({
  BASE_URL: 'http://test',
  request: jest.fn(),
}));

import { request } from '../api/client';
import { realApi } from '../api/real';

const req = request as jest.Mock;
beforeEach(() => req.mockReset());

describe('realApi.scan: сопоставление ответов сервера', () => {
  const cases: [string, string][] = [
    ['admitted', 'valid'],
    ['undone', 'valid'],
    ['already_used', 'already_used'],
    ['cancelled', 'cancelled'],
    ['refunded', 'refunded'],
    ['invalid', 'invalid'],
    ['wrong_event', 'wrong_event'],
    ['event_cancelled', 'event_cancelled'],
    ['event_not_active', 'event_not_active'],
    ['event_suspended', 'event_suspended'],
    ['campaign_qr_not_admission', 'campaign_qr'],
  ];

  it.each(cases)('result "%s" -> status "%s"', async (result, status) => {
    req.mockResolvedValue({ result });
    const r = await realApi.scan('ev1', 'code');
    expect(r.status).toBe(status);
  });

  it('неизвестный result превращается в invalid', async () => {
    req.mockResolvedValue({ result: 'something_new' });
    expect((await realApi.scan('ev1', 'x')).status).toBe('invalid');
  });

  it('отправляет event_id и payload в /checkin/scan', async () => {
    req.mockResolvedValue({ result: 'admitted' });
    await realApi.scan('ev1', 'BFT1.k.BF-T-AAA.sig');
    const [path, opts] = req.mock.calls[0];
    expect(path).toBe('/checkin/scan');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ event_id: 'ev1', payload: 'BFT1.k.BF-T-AAA.sig' });
  });

  it('переносит данные билета', async () => {
    req.mockResolvedValue({
      result: 'admitted',
      ticket_id: 'uuid-1',
      public_id: 'BF-T-3K8P2Q',
      attendee_name: 'Aruzhan Serikova',
      ticket_type_name: 'VIP',
      seat_label: 'Row B · Seat 6',
    });
    const r = await realApi.scan('ev1', 'x');
    expect(r).toMatchObject({
      ticketId: 'uuid-1',
      publicId: 'BF-T-3K8P2Q',
      attendee: 'Aruzhan Serikova',
      seat: 'VIP · Row B · Seat 6',
      message: 'Checked in just now',
    });
  });

  it('место не показывается, если сервер его не прислал', async () => {
    req.mockResolvedValue({ result: 'admitted' });
    expect((await realApi.scan('ev1', 'x')).seat).toBeUndefined();
  });
});

describe('realApi.undo', () => {
  it('вызывает /checkin/tickets/{id}/undo с причиной', async () => {
    req.mockResolvedValue({});
    await realApi.undo('ev1', 'uuid-1');
    const [path, opts] = req.mock.calls[0];
    expect(path).toBe('/checkin/tickets/uuid-1/undo');
    expect(JSON.parse(opts.body).reason.length).toBeGreaterThanOrEqual(3);
  });
});

describe('realApi.undo: причина', () => {
  it('передаёт выбранную причину', async () => {
    req.mockResolvedValue({});
    await realApi.undo('ev1', 'uuid-1', 'Guest left before entering');
    expect(JSON.parse(req.mock.calls[0][1].body).reason).toBe('Guest left before entering');
  });
  it('слишком короткая причина заменяется на запасную', async () => {
    req.mockResolvedValue({});
    await realApi.undo('ev1', 'uuid-1', 'x');
    expect(JSON.parse(req.mock.calls[0][1].body).reason.length).toBeGreaterThanOrEqual(3);
  });
});

describe('realApi.scan: тексты', () => {
  it('для приостановленного события есть понятная подсказка', async () => {
    req.mockResolvedValue({ result: 'event_suspended' });
    expect((await realApi.scan('ev1', 'x')).message).toContain('suspended');
  });
});

describe('realApi.search', () => {
  it('кодирует запрос и приводит статус к нижнему регистру', async () => {
    req.mockResolvedValue([
      { ticket_id: 'u1', public_id: 'BF-T-1', attendee_name: 'A B', ticket_type_name: 'GA', seat_label: null, status: 'CHECKED_IN' },
    ]);
    const rows = await realApi.search('ev1', ' a&b ');
    expect(req.mock.calls[0][0]).toBe('/checkin/events/ev1/attendees?q=a%26b');
    expect(rows[0]).toEqual({
      ticketId: 'u1', publicId: 'BF-T-1', name: 'A B', seat: 'GA', status: 'checked_in',
    });
  });
});

describe('realApi.getEvents', () => {
  it('убирает дубликаты событий и подставляет счётчики', async () => {
    req.mockImplementation(async (path: string) => {
      if (path === '/events/mine')
        return [
          { id: 'e1', title: 'One', starts_at: '2026-12-01T10:00:00Z', status: 'PUBLISHED' },
          { id: 'e1', title: 'One', starts_at: '2026-12-01T10:00:00Z', status: 'PUBLISHED' },
        ];
      return { registered: 10, checked_in: 4 };
    });
    const list = await realApi.getEvents();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'e1', total: 10, checkedIn: 4 });
  });

  it('если статистика недоступна, счётчики равны нулю', async () => {
    req.mockImplementation(async (path: string) => {
      if (path === '/events/mine') return [{ id: 'e1', title: 'One', starts_at: '2026-12-01T10:00:00Z', status: 'PUBLISHED' }];
      throw new Error('403');
    });
    const list = await realApi.getEvents();
    expect(list[0]).toMatchObject({ total: 0, checkedIn: 0 });
  });
});

describe('realApi.login', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('отправляет форму username/password и возвращает токен', async () => {
    const f = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: 'tok' }) });
    globalThis.fetch = f as any;
    const r = await realApi.login('a@b.kz', 'p&ss');
    expect(r.token).toBe('tok');
    const [url, opts] = f.mock.calls[0];
    expect(url).toBe('http://test/auth/token');
    expect(opts.body).toBe('username=a%40b.kz&password=p%26ss');
  });

  it('401 -> понятное сообщение', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }) as any;
    await expect(realApi.login('a', 'b')).rejects.toThrow('Неверный email или пароль');
  });

  it('нет сети -> сообщение про сервер', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('net')) as any;
    await expect(realApi.login('a', 'b')).rejects.toThrow('Нет связи с сервером');
  });
});
