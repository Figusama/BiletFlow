import { request } from './client';
import { fmtDateTime, fmtPrice } from '../format';
import type { IconName } from '../components/Icon';

// ---- очереди заявок, которые разбирает Platform Admin ----
export type QueueKind = 'applications' | 'changes' | 'paidSales' | 'cancellations' | 'refunds';

export type QueueItem = {
  id: string;
  kind: QueueKind;
  title: string;
  subtitle: string;
  lines: string[];
  // refunds: у возврата с ошибкой выплаты доступна кнопка Retry
  canRetry?: boolean;
  // refunds: статус ожидает решения администратора (Approve/Reject)
  decidable: boolean;
};

export const QUEUES: { kind: QueueKind; title: string; icon: IconName; hint: string }[] = [
  { kind: 'applications', title: 'Event applications', icon: 'fileText', hint: 'New events waiting for approval' },
  { kind: 'changes', title: 'Change requests', icon: 'edit', hint: 'Changes to published events' },
  { kind: 'paidSales', title: 'Paid sales', icon: 'creditCard', hint: 'Organizers asking to sell tickets' },
  { kind: 'cancellations', title: 'Event cancellations', icon: 'ban', hint: 'Organizers cancelling events' },
  { kind: 'refunds', title: 'Refunds', icon: 'undo', hint: 'Refund requests for admin review' },
];

const when = (iso?: string | null) => (iso ? fmtDateTime(iso) : '—');

export const toApplication = (a: any): QueueItem => ({
  id: a.id,
  kind: 'applications',
  title: a.title || 'Untitled event',
  subtitle: a.application_number || '',
  lines: [
    a.starts_at ? `Starts: ${when(a.starts_at)}` : '',
    a.venue_name_snapshot ? `Venue: ${a.venue_name_snapshot}${a.venue_city_snapshot ? ', ' + a.venue_city_snapshot : ''}` : '',
    a.responsible_name ? `Responsible: ${a.responsible_name}${a.responsible_email ? ' · ' + a.responsible_email : ''}` : '',
    a.intends_paid_sales ? 'Plans paid sales' : 'Free event',
    a.submitted_at ? `Submitted: ${when(a.submitted_at)}` : '',
  ].filter(Boolean),
  decidable: true,
});

export const toChange = (c: any): QueueItem => ({
  id: c.id,
  kind: 'changes',
  title: `Change ${c.request_number || ''}`.trim(),
  subtitle: c.comment || '',
  lines: [
    ...(c.items || []).map((i: any) => `${String(i.field).replace(/_/g, ' ')}: ${show(i.old_value)} → ${show(i.new_value)}`),
    c.submitted_at ? `Submitted: ${when(c.submitted_at)}` : '',
  ].filter(Boolean),
  decidable: true,
});

export const toPaidSales = (r: any): QueueItem => ({
  id: r.id,
  kind: 'paidSales',
  title: r.event_title,
  subtitle: `Terms ${r.terms_version}`,
  lines: [`Submitted: ${when(r.submitted_at)}`],
  decidable: true,
});

export const toCancellation = (r: any): QueueItem => ({
  id: r.id,
  kind: 'cancellations',
  title: r.event_title,
  subtitle: `Requested: ${when(r.created_at)}`,
  lines: [`Reason: ${r.reason}`],
  decidable: true,
});

export const toRefund = (r: any): QueueItem => {
  const failed = String(r.execution_status || '').toUpperCase().includes('FAIL');
  return {
    id: r.id,
    kind: 'refunds',
    title: `Order ${r.order_number}`,
    subtitle: `${fmtPrice(r.amount_minor)} · ${String(r.source).replace(/_/g, ' ').toLowerCase()}`,
    lines: [
      r.reason_code ? `Reason: ${String(r.reason_code).replace(/_/g, ' ').toLowerCase()}` : '',
      r.comment ? `Comment: ${r.comment}` : '',
      r.execution_status ? `Payout: ${String(r.execution_status).toLowerCase()}` : '',
      `Created: ${when(r.created_at)}`,
    ].filter(Boolean),
    canRetry: failed,
    decidable: String(r.status).toUpperCase() === 'PENDING_ADMIN',
  };
};

function show(v: any): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v.length > 60 ? v.slice(0, 57) + '…' : v;
  const s = JSON.stringify(v);
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}

export async function loadQueue(kind: QueueKind): Promise<QueueItem[]> {
  switch (kind) {
    case 'applications':
      return (await request<any[]>('/admin/event-applications?status=PENDING&limit=50')).map(toApplication);
    case 'changes':
      return (await request<any[]>('/admin/change-requests?status=PENDING')).map(toChange);
    case 'paidSales':
      return (await request<any[]>('/admin/paid-sales/requests?status=PENDING')).map(toPaidSales);
    case 'cancellations':
      return (await request<any[]>('/admin/cancellation-requests?status=PENDING')).map(toCancellation);
    case 'refunds':
      return (await request<any[]>('/admin/refund-requests?status=PENDING_ADMIN&limit=50')).map(toRefund);
  }
}

const post = (path: string, body?: object) =>
  request<any>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });

// Подтверждение. Для заявки на событие сервер требует confirm_responsible_organizer.
export async function approve(item: QueueItem, opts: { refundMode?: 'AUTOMATIC_FULL' | 'ADMIN_REVIEW' } = {}) {
  switch (item.kind) {
    case 'applications':
      return post(`/admin/event-applications/${item.id}/approve`, { confirm_responsible_organizer: true });
    case 'changes':
      return post(`/admin/change-requests/${item.id}/approve`, {});
    case 'paidSales':
      return post(`/admin/paid-sales/requests/${item.id}/approve`);
    case 'cancellations':
      return post(`/admin/cancellation-requests/${item.id}/approve`, opts.refundMode ? { refund_handling_mode: opts.refundMode } : {});
    case 'refunds':
      return post(`/refund-requests/${item.id}/approve`, {});
  }
}

// Отказ: у всех очередей нужна причина 3–2000 символов.
export async function reject(item: QueueItem, reason: string) {
  const text = reason.trim();
  switch (item.kind) {
    case 'applications':
      return post(`/admin/event-applications/${item.id}/reject`, { review_comment: text });
    case 'changes':
      return post(`/admin/change-requests/${item.id}/reject`, { review_comment: text });
    case 'paidSales':
      return post(`/admin/paid-sales/requests/${item.id}/reject`, { reason: text });
    case 'cancellations':
      return post(`/admin/cancellation-requests/${item.id}/reject`, { review_comment: text });
    case 'refunds':
      return post(`/refund-requests/${item.id}/reject`, { comment: text });
  }
}

export const retryRefund = (id: string) => post(`/admin/refund-requests/${id}/retry`);

// Счётчики для главной вкладки Admin. Если очередь не загрузилась, показываем null.
export async function loadCounts(): Promise<Record<QueueKind, number | null>> {
  const kinds = QUEUES.map((q) => q.kind);
  const res = await Promise.all(kinds.map((k) => loadQueue(k).then((l) => l.length).catch(() => null)));
  return Object.fromEntries(kinds.map((k, i) => [k, res[i]])) as Record<QueueKind, number | null>;
}

// ---- пользователи ----
export type AdminUserRow = {
  id: string; publicId: string; email: string; name: string; role: string; suspended: boolean;
};
const toUser = (u: any): AdminUserRow => ({
  id: u.id, publicId: u.public_id, email: u.email, name: u.full_name || '', role: u.personal_role, suspended: !!u.is_suspended,
});
export async function searchUsers(q: string): Promise<AdminUserRow[]> {
  const qs = q.trim() ? `&q=${encodeURIComponent(q.trim())}` : '';
  return (await request<any[]>(`/admin/users?limit=50${qs}`)).map(toUser);
}
// Эти эндпоинты отвечают 204 без тела; client.request это учитывает.
export const suspendUser = (id: string) => request<void>(`/users/${id}/suspend`, { method: 'POST' });
export const unsuspendUser = (id: string) => request<void>(`/users/${id}/unsuspend`, { method: 'POST' });

// ---- события ----
export type AdminEventRow = {
  id: string; title: string; status: string; suspended: boolean; reason?: string;
  startsAt: string; organizer?: string; tickets: number;
};
const toEvent = (e: any): AdminEventRow => ({
  id: e.id, title: e.title, status: e.status, suspended: !!e.is_suspended,
  reason: e.suspension_reason ?? undefined, startsAt: e.starts_at,
  organizer: e.organizer_email ?? undefined, tickets: Number(e.tickets_issued ?? 0),
});
export async function searchEvents(q: string): Promise<AdminEventRow[]> {
  const qs = q.trim() ? `&q=${encodeURIComponent(q.trim())}` : '';
  return (await request<any[]>(`/admin/events?limit=50${qs}`)).map(toEvent);
}
export const suspendEvent = (id: string, reason: string) =>
  post(`/admin/events/${id}/suspend`, { reason: reason.trim() });
export const restoreEvent = (id: string) => post(`/admin/events/${id}/restore`);

// ---- роль текущего пользователя ----
export async function getMyRole(): Promise<string> {
  const me = await request<any>('/users/me');
  return String(me.personal_role || 'USER');
}
