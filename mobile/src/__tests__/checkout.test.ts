jest.mock('../api/client', () => ({
  BASE_URL: 'http://backend.test:8000',
  request: jest.fn(),
}));

import { request } from '../api/client';
import {
  buildAttendees, cancelOrder, cartCount, cartTotal, clampQty, createOrder, createReservation, decideSimulated, fmtCountdown,
  isPaymentReturn, maxQty, purchasable, releaseReservation, resolvePaymentUrl, secondsLeft, startPayment, validatePromo, waitForOrder,
} from '../api/checkout';

const req = request as jest.Mock;
beforeEach(() => req.mockReset());
const body = (i = 0) => JSON.parse(req.mock.calls[i][1].body);

const lines = [
  { ticketTypeId: 't1', name: 'Free', unitPriceMinor: 0, quantity: 2 },
  { ticketTypeId: 't2', name: 'VIP', unitPriceMinor: 1500000, quantity: 1 },
  { ticketTypeId: 't3', name: 'Unused', unitPriceMinor: 500000, quantity: 0 },
];

describe('корзина', () => {
  it('считает количество и сумму', () => {
    expect(cartCount(lines)).toBe(3);
    expect(cartTotal(lines)).toBe(1500000);
  });
  it('maxQty и clampQty учитывают лимит заказа и остаток', () => {
    expect(maxQty({ maxPerOrder: 5, available: 3 })).toBe(3);
    expect(maxQty({ maxPerOrder: 5, available: null })).toBe(5);
    expect(maxQty({ maxPerOrder: 0, available: null })).toBe(10);
    expect(clampQty(9, { maxPerOrder: 5, available: 8 })).toBe(5);
    expect(clampQty(-2, { maxPerOrder: 5, available: 8 })).toBe(0);
  });
  it('purchasable: распроданное и закрытое не покупается', () => {
    expect(purchasable({ available: 5, saleState: 'ON_SALE' })).toBe(true);
    expect(purchasable({ available: 0, saleState: 'ON_SALE' })).toBe(false);
    expect(purchasable({ available: 5, saleState: 'SALES_ENDED' })).toBe(false);
    expect(purchasable({ available: null, saleState: 'NOT_STARTED' })).toBe(false);
  });
});

describe('имена посетителей', () => {
  const L = [
    { ticketTypeId: 't1', name: 'Free', unitPriceMinor: 0, quantity: 2 },
    { ticketTypeId: 't2', name: 'VIP', unitPriceMinor: 100, quantity: 1 },
  ];
  it('без введённых имён ничего не отправляется', () => {
    expect(buildAttendees(L, {}, 'Buyer')).toBeUndefined();
    expect(buildAttendees(L, { t1: ['', '  '] }, 'Buyer')).toBeUndefined();
  });
  it('пустые имена заменяются именем покупателя, порядок сохраняется', () => {
    expect(buildAttendees(L, { t1: ['Aruzhan'] }, 'Buyer')).toEqual([
      { ticket_type_id: 't1', names: ['Aruzhan', 'Buyer'] },
      { ticket_type_id: 't2', names: ['Buyer'] },
    ]);
  });
  it('без имени покупателя и с пропуском имена не отправляются', () => {
    expect(buildAttendees(L, { t1: ['Aruzhan'] }, '')).toBeUndefined();
  });
  it('createOrder добавляет attendees в тело', async () => {
    req.mockResolvedValue({ id: 'o1' });
    await createOrder('r1', undefined, [{ ticket_type_id: 't1', names: ['A'] }]);
    expect(body()).toEqual({ attendees: [{ ticket_type_id: 't1', names: ['A'] }] });
    req.mockClear();
    req.mockResolvedValue({ id: 'o1' });
    await createOrder('r1', 'PROMO', []);
    expect(body()).toEqual({ promo_code: 'PROMO' });
  });
});

describe('резервация', () => {
  it('отправляет только строки с количеством > 0 и пустые места', async () => {
    req.mockResolvedValue({ id: 'r1', expires_at: '2026-11-25T12:00:00Z' });
    const r = await createReservation('e1', lines);
    expect(req.mock.calls[0][0]).toBe('/events/e1/reservations');
    expect(body()).toEqual({
      items: [{ ticket_type_id: 't1', quantity: 2 }, { ticket_type_id: 't2', quantity: 1 }],
      event_seat_ids: [],
    });
    expect(r).toEqual({ id: 'r1', expiresAt: '2026-11-25T12:00:00Z' });
  });
  it('освобождение — DELETE', async () => {
    req.mockResolvedValue(undefined);
    await releaseReservation('r1');
    expect(req.mock.calls[0][0]).toBe('/reservations/r1');
    expect(req.mock.calls[0][1].method).toBe('DELETE');
  });
  it('secondsLeft и fmtCountdown', () => {
    const now = Date.parse('2026-11-25T10:00:00Z');
    expect(secondsLeft('2026-11-25T10:01:05Z', now)).toBe(65);
    expect(secondsLeft('2026-11-25T09:00:00Z', now)).toBe(0);
    expect(secondsLeft('bad', now)).toBeNull();
    expect(fmtCountdown(65)).toBe('1:05');
    expect(fmtCountdown(0)).toBe('0:00');
  });
});

describe('промокод и заказ', () => {
  it('validatePromo отправляет код и приводит ответ', async () => {
    req.mockResolvedValue({ valid: true, code: 'SEEDPROMO', message: null, subtotal_minor: 1000, discount_minor: 100, total_minor: 900 });
    const r = await validatePromo(' SEEDPROMO ', 'r1');
    expect(body()).toEqual({ code: 'SEEDPROMO', reservation_id: 'r1' });
    expect(r).toMatchObject({ valid: true, discountMinor: 100, totalMinor: 900 });
  });
  it('createOrder: промокод передаётся только если он есть', async () => {
    req.mockResolvedValue({ id: 'o1', order_number: 'BF-O-1', status: 'confirmed', total_minor: 0, requires_payment: false, ticket_ids: ['a', 'b'] });
    const o = await createOrder('r1');
    expect(req.mock.calls[0][0]).toBe('/reservations/r1/order');
    expect(body()).toEqual({});
    expect(o).toMatchObject({ id: 'o1', number: 'BF-O-1', status: 'CONFIRMED', requiresPayment: false, ticketIds: ['a', 'b'] });
    req.mockClear();
    req.mockResolvedValue({ id: 'o2' });
    await createOrder('r1', ' PROMO ');
    expect(body()).toEqual({ promo_code: 'PROMO' });
  });
  it('cancelOrder — POST', async () => {
    req.mockResolvedValue({});
    await cancelOrder('o1');
    expect(req.mock.calls[0][0]).toBe('/orders/o1/cancel');
  });
});

describe('оплата', () => {
  it('startPayment отправляет Idempotency-Key и приводит ответ', async () => {
    req.mockResolvedValue({ id: 'p1', status: 'PENDING', amount_minor: 1500000, is_simulated: true, payment_url: '/payments/simulator/p1' });
    const p = await startPayment('o1', 'key-1');
    expect(req.mock.calls[0][0]).toBe('/orders/o1/payments');
    expect(req.mock.calls[0][1].headers).toEqual({ 'Idempotency-Key': 'key-1' });
    expect(p).toMatchObject({ id: 'p1', isSimulated: true, amountMinor: 1500000, paymentUrl: '/payments/simulator/p1' });
  });
  it('decideSimulated отправляет исход', async () => {
    req.mockResolvedValue({ id: 'p1', status: 'FAILED' });
    const p = await decideSimulated('p1', 'decline');
    expect(req.mock.calls[0][0]).toBe('/payments/simulator/p1/decision');
    expect(body()).toEqual({ outcome: 'decline' });
    expect(p.status).toBe('FAILED');
  });
  it('resolvePaymentUrl: локальные адреса заменяются, внешняя оплата остаётся как есть', () => {
    const base = 'http://backend.test:8000';
    const web = 'http://site.test:5173';
    expect(resolvePaymentUrl('http://localhost:8000/payments/halyk/p1?x=1', base, web)).toBe('http://backend.test:8000/payments/halyk/p1?x=1');
    expect(resolvePaymentUrl('http://127.0.0.1:8000/pay', base, web)).toBe('http://backend.test:8000/pay');
    expect(resolvePaymentUrl('http://localhost:5173/orders/o1', base, web)).toBe('http://site.test:5173/orders/o1');
    expect(resolvePaymentUrl('/payments/simulator/p1', base, web)).toBe('http://backend.test:8000/payments/simulator/p1');
    // реальная оплата (Halyk): адрес менять нельзя
    expect(resolvePaymentUrl('https://epay.example-bank.kz/pay?id=7', base, web)).toBe('https://epay.example-bank.kz/pay?id=7');
    expect(resolvePaymentUrl(null, base, web)).toBeUndefined();
    expect(resolvePaymentUrl('garbage', base, web)).toBeUndefined();
  });
  it('isPaymentReturn: закрываем WebView только при возврате на наш сайт или бэкенд', () => {
    const base = 'http://backend.test:8000';
    const web = 'http://site.test:5173';
    expect(isPaymentReturn('http://site.test:5173/orders/o1?paid=1', web, base)).toBe(true);
    expect(isPaymentReturn('http://site.test:5173/tickets', web, base)).toBe(true);
    expect(isPaymentReturn('http://site.test:5173/events/e1', web, base)).toBe(false);
    expect(isPaymentReturn('http://backend.test:8000/payments/halyk/p1/return', web, base)).toBe(true);
    expect(isPaymentReturn('https://epay.example-bank.kz/orders/1', web, base)).toBe(false);
    expect(isPaymentReturn('not a url', web, base)).toBe(false);
  });
});

describe('waitForOrder', () => {
  const sleep = jest.fn(async () => {});
  beforeEach(() => sleep.mockClear());

  it('возвращает заказ, как только он перестал быть PENDING', async () => {
    req.mockResolvedValueOnce({ id: 'o1', status: 'PENDING' })
       .mockResolvedValueOnce({ id: 'o1', status: 'PENDING' })
       .mockResolvedValueOnce({ id: 'o1', status: 'CONFIRMED' });
    const o = await waitForOrder('o1', { sleep });
    expect(o.status).toBe('CONFIRMED');
    expect(req).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
  it('после лимита попыток возвращает PENDING, а не зависает', async () => {
    req.mockResolvedValue({ id: 'o1', status: 'PENDING' });
    const o = await waitForOrder('o1', { tries: 3, sleep });
    expect(o.status).toBe('PENDING');
    expect(req).toHaveBeenCalledTimes(3);
  });
});
