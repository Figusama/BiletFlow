import { request } from './client';
import { fmtPrice } from '../format';
import type { BadgeTone } from '../components/Badge';

// ---- «Мои события»: события, где пользователь организатор или сотрудник ----
export type ManagedEvent = {
  id: string;
  title: string;
  status: string; // DRAFT | PUBLISHED | CANCELLED | COMPLETED
  isSuspended: boolean;
  startsAt: string;
  endsAt: string;
  timezone: string;
  venue?: string;
  seatingMode: string;
};

export const toManagedEvent = (e: any): ManagedEvent => ({
  id: e.id,
  title: e.title ?? '',
  status: String(e.status ?? '').toUpperCase(),
  isSuspended: !!e.is_suspended,
  startsAt: e.starts_at,
  endsAt: e.ends_at,
  timezone: e.timezone ?? '',
  venue: [e.venue_name, e.venue_city].filter(Boolean).join(', ') || undefined,
  seatingMode: String(e.seating_mode ?? ''),
});

// Подпись и цвет статуса. Приостановка важнее жизненного цикла.
export function statusInfo(status: string, suspended = false): { label: string; tone: BadgeTone } {
  if (suspended) return { label: 'Suspended', tone: 'danger' };
  switch (status.toUpperCase()) {
    case 'DRAFT': return { label: 'Draft', tone: 'neutral' };
    case 'PUBLISHED': return { label: 'Published', tone: 'success' };
    case 'CANCELLED': return { label: 'Cancelled', tone: 'danger' };
    case 'COMPLETED': return { label: 'Completed', tone: 'info' };
    default: return { label: status || 'Unknown', tone: 'neutral' };
  }
}

// Какие действия доступны организатору. Решает сервер (права и условия), здесь только подсказка для кнопок.
export const canPublish = (e: Pick<ManagedEvent, 'status' | 'isSuspended'>) => e.status === 'DRAFT' && !e.isSuspended;
export const canUnpublish = (e: Pick<ManagedEvent, 'status' | 'isSuspended'>) => e.status === 'PUBLISHED' && !e.isSuspended;

export async function getManagedEvent(id: string): Promise<ManagedEvent> {
  return toManagedEvent(await request<any>(`/events/${id}/manage`));
}

export const publishEvent = async (id: string) => toManagedEvent(await request<any>(`/events/${id}/publish`, { method: 'POST' }));
export const unpublishEvent = async (id: string) => toManagedEvent(await request<any>(`/events/${id}/unpublish`, { method: 'POST' }));

// ---- типы билетов события (для организатора, видны и неактивные) ----
export type ManagedTicketType = {
  id: string;
  name: string;
  kind: string;
  priceMinor: number;
  total: number | null;
  available: number | null;
  active: boolean;
  saleState: string;
};

export const toManagedTicketType = (t: any): ManagedTicketType => ({
  id: t.id,
  name: t.name ?? '',
  kind: String(t.kind ?? '').toUpperCase(),
  priceMinor: Number(t.price_minor ?? 0),
  total: t.quantity_total ?? null,
  available: t.available ?? null,
  active: t.is_active !== false,
  saleState: String(t.sale_state ?? ''),
});

export async function getManagedTicketTypes(eventId: string): Promise<ManagedTicketType[]> {
  const rows = await request<any[]>(`/events/${eventId}/ticket-types/manage`);
  return rows.map(toManagedTicketType);
}

// Строка «продано из всего»: 12 / 100 или 12 / ∞
export const soldText = (t: Pick<ManagedTicketType, 'total' | 'available'>) => {
  if (t.total == null) return t.available == null ? '' : `${t.available} left`;
  const sold = Math.max(0, t.total - (t.available ?? t.total));
  return `${sold} / ${t.total} sold`;
};

export const ticketPriceText = (t: Pick<ManagedTicketType, 'priceMinor'>) => fmtPrice(t.priceMinor);

// ---- сводка продаж ----
export type SalesSummary = {
  sold: number;
  capacity: number | null;
  grossMinor: number;
  netMinor: number | null;
  demo: boolean;
};

export const toSalesSummary = (a: any): SalesSummary => ({
  sold: Number(a?.inventory?.sold ?? 0),
  capacity: a?.inventory?.capacity ?? null,
  grossMinor: Number(a?.financial?.gross_sales_minor ?? 0),
  netMinor: a?.financial?.net_revenue_minor ?? null,
  demo: !!a?.financial?.is_demonstration,
});

// Аналитика доступна не всем ролям (сотруднику check-in вернётся 403): тогда просто не показываем блок.
export async function getSalesSummary(eventId: string): Promise<SalesSummary | null> {
  try {
    return toSalesSummary(await request<any>(`/events/${eventId}/analytics`));
  } catch {
    return null;
  }
}

// Статус платных продаж события (нужен, чтобы объяснить, почему нельзя купить платный билет).
export type PaidSalesState = { status: string; activated: boolean; suspended: boolean };

export async function getPaidSales(eventId: string): Promise<PaidSalesState | null> {
  try {
    const a = await request<any>(`/events/${eventId}/paid-sales`);
    const status = String(a.status ?? '').toUpperCase();
    return { status, activated: !!a.activated_at && !a.suspended_at, suspended: !!a.suspended_at };
  } catch {
    return null;
  }
}

export function paidSalesText(s: PaidSalesState | null): string {
  if (!s) return '';
  if (s.suspended) return 'Paid sales are suspended';
  if (s.activated) return 'Paid sales are on';
  return 'Paid sales are not activated yet';
}
