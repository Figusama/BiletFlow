import { request, BASE_URL } from './client';
import { WEB_BASE_URL } from '../env';
import { TicketTypeItem } from '../types';

// ---- корзина ----
export type CartLine = { ticketTypeId: string; name: string; unitPriceMinor: number; quantity: number };

export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0);
export const cartTotal = (lines: CartLine[]) => lines.reduce((s, l) => s + l.unitPriceMinor * l.quantity, 0);

// Количество билета: от 0 до min(max_per_order, остаток). maxPerOrder=0 трактуем как «без лимита».
export const maxQty = (t: Pick<TicketTypeItem, 'maxPerOrder' | 'available'>) => {
  const perOrder = t.maxPerOrder > 0 ? t.maxPerOrder : 10;
  return Math.max(0, t.available == null ? perOrder : Math.min(perOrder, t.available));
};
export const clampQty = (qty: number, t: Pick<TicketTypeItem, 'maxPerOrder' | 'available'>) =>
  Math.min(Math.max(0, Math.floor(qty)), maxQty(t));

// Можно ли сейчас купить этот тип билета (окончательно решает сервер при резервации).
export const purchasable = (t: Pick<TicketTypeItem, 'available' | 'saleState'>) =>
  t.available !== 0 && !/sold|not[_ ]?started|ended|paused|inactive|upcoming|closed|expired/i.test(t.saleState || '');

// ---- резервация ----
export type Reservation = { id: string; expiresAt: string };

export async function createReservation(eventId: string, lines: CartLine[]): Promise<Reservation> {
  const r = await request<any>(`/events/${eventId}/reservations`, {
    method: 'POST',
    body: JSON.stringify({
      items: lines.filter((l) => l.quantity > 0).map((l) => ({ ticket_type_id: l.ticketTypeId, quantity: l.quantity })),
      event_seat_ids: [],
    }),
  });
  return { id: r.id, expiresAt: r.expires_at };
}

export const releaseReservation = (id: string) => request<void>(`/reservations/${id}`, { method: 'DELETE' });

// Секунд до конца резервации (null, если дата не распознана).
export function secondsLeft(expiresAt: string, now: number = Date.now()): number | null {
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - now) / 1000));
}
export const fmtCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ---- промокод ----
export type PromoResult = { valid: boolean; message: string; subtotalMinor: number; discountMinor: number; totalMinor: number };

export async function validatePromo(code: string, reservationId: string): Promise<PromoResult> {
  const r = await request<any>('/promo-codes/validate', {
    method: 'POST',
    body: JSON.stringify({ code: code.trim(), reservation_id: reservationId }),
  });
  return {
    valid: !!r.valid,
    message: r.message || (r.valid ? 'Promo code applied' : 'This promo code can’t be used'),
    subtotalMinor: Number(r.subtotal_minor ?? 0),
    discountMinor: Number(r.discount_minor ?? 0),
    totalMinor: Number(r.total_minor ?? 0),
  };
}

// ---- заказ ----
export type Order = {
  id: string;
  number: string;
  status: string;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  requiresPayment: boolean;
  ticketIds: string[];
};

const toOrder = (o: any): Order => ({
  id: o.id,
  number: o.order_number,
  status: String(o.status ?? '').toUpperCase(),
  subtotalMinor: Number(o.subtotal_minor ?? 0),
  discountMinor: Number(o.discount_minor ?? 0),
  totalMinor: Number(o.total_minor ?? 0),
  requiresPayment: !!o.requires_payment,
  ticketIds: o.ticket_ids ?? [],
});

// Имена посетителей: по строке на каждый тип билета, имена идут в порядке билетов.
export type AttendeeBody = { ticket_type_id: string; names: string[] };

// names: введённые на экране имена по id типа билета. Пустые заменяем именем покупателя (fallback).
// Если ни одного имени не введено, возвращаем undefined: сервер подставит имя по умолчанию.
export function buildAttendees(
  lines: CartLine[],
  names: Record<string, string[]>,
  fallback?: string,
): AttendeeBody[] | undefined {
  const anyTyped = lines.some((l) => (names[l.ticketTypeId] ?? []).some((n) => n && n.trim()));
  if (!anyTyped) return undefined;
  const body: AttendeeBody[] = [];
  for (const l of lines) {
    if (l.quantity <= 0) continue;
    const typed = names[l.ticketTypeId] ?? [];
    const list: string[] = [];
    for (let i = 0; i < l.quantity; i++) {
      const v = (typed[i] ?? '').trim();
      if (v) list.push(v);
      else if (fallback && fallback.trim()) list.push(fallback.trim());
      else return undefined; // без имени покупателя не можем заполнить пропуск: не отправляем имена вовсе
    }
    body.push({ ticket_type_id: l.ticketTypeId, names: list });
  }
  return body.length ? body : undefined;
}

export async function getMyName(): Promise<string> {
  const me = await request<any>('/users/me');
  return String(me?.full_name ?? '');
}

export async function createOrder(reservationId: string, promoCode?: string, attendees?: AttendeeBody[]): Promise<Order> {
  const code = promoCode?.trim();
  const payload: Record<string, unknown> = {};
  if (code) payload.promo_code = code;
  if (attendees && attendees.length) payload.attendees = attendees;
  return toOrder(
    await request<any>(`/reservations/${reservationId}/order`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  );
}

export const getOrder = async (id: string): Promise<Order> => toOrder(await request<any>(`/orders/${id}`));
export const cancelOrder = (id: string) => request<any>(`/orders/${id}/cancel`, { method: 'POST' });

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Ждём, пока заказ выйдет из PENDING (платёж обрабатывается). Возвращает последний статус.
export async function waitForOrder(
  orderId: string,
  opts: { tries?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Order> {
  const { tries = 10, delayMs = 1000, sleep = defaultSleep } = opts;
  let order = await getOrder(orderId);
  for (let i = 1; i < tries && order.status === 'PENDING'; i++) {
    await sleep(delayMs);
    order = await getOrder(orderId);
  }
  return order;
}

// ---- оплата ----
export type Payment = {
  id: string;
  status: string;
  amountMinor: number;
  isSimulated: boolean;
  paymentUrl?: string;
};

const toPayment = (p: any): Payment => ({
  id: p.id,
  status: String(p.status ?? '').toUpperCase(),
  amountMinor: Number(p.amount_minor ?? 0),
  isSimulated: !!p.is_simulated,
  paymentUrl: p.payment_url ?? undefined,
});

// Idempotency-Key защищает от двойного списания при повторном нажатии.
export async function startPayment(orderId: string, key: string): Promise<Payment> {
  return toPayment(
    await request<any>(`/orders/${orderId}/payments`, { method: 'POST', headers: { 'Idempotency-Key': key } }),
  );
}

export type SimOutcome = 'approve' | 'decline';
export async function decideSimulated(paymentId: string, outcome: SimOutcome): Promise<Payment> {
  return toPayment(
    await request<any>(`/payments/simulator/${paymentId}/decision`, { method: 'POST', body: JSON.stringify({ outcome }) }),
  );
}

// Адрес страницы оплаты. Бэкенд может вернуть localhost/относительный путь (локальный запуск): тогда
// подставляем адрес, по которому телефон реально достаёт бэкенд (или сайт, если порт сайта).
// Внешний адрес платёжной системы (Halyk и т.п.) оставляем как есть: его подменять нельзя.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:(\d+))?$/i;

const portOf = (base: string) => /:(\d+)(?:\/|$)/.exec(base)?.[1];

export function resolvePaymentUrl(
  url?: string | null,
  base: string = BASE_URL,
  webBase: string = WEB_BASE_URL,
): string | undefined {
  if (!url) return undefined;
  const m = /^https?:\/\/([^/?#]+)(.*)$/i.exec(url);
  if (m) {
    const local = LOCAL_HOST.exec(m[1]);
    if (!local) return url;
    const rest = m[2] || '/';
    const path = rest.startsWith('/') ? rest : '/' + rest;
    const port = local[3];
    return (port && port === portOf(webBase) ? webBase : base) + path;
  }
  if (url.startsWith('/')) return base + url;
  return undefined;
}

// Вернулся ли пользователь со страницы оплаты на наш сайт/бэкенд (тогда WebView можно закрыть).
export function isPaymentReturn(
  url: string,
  webBase: string = WEB_BASE_URL,
  base: string = BASE_URL,
): boolean {
  const m = /^(https?:\/\/[^/?#]+)(\/[^?#]*)?/i.exec(url);
  if (!m) return false;
  const origin = m[1].toLowerCase();
  const path = m[2] || '/';
  const wm = /^(https?:\/\/[^/?#]+)/i.exec(webBase);
  const bm = /^(https?:\/\/[^/?#]+)/i.exec(base);
  if (wm && origin === wm[1].toLowerCase()) return /^\/(orders|tickets|checkout)(\/|$)/i.test(path);
  if (bm && origin === bm[1].toLowerCase()) return /\/payments?\/.*(return|success|fail|cancel|callback)/i.test(path);
  return false;
}
