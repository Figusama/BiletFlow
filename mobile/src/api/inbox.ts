import { request } from './client';
import { fmtDateTime } from '../format';

// ---- уведомления ----
export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  actionUrl?: string;
  read: boolean;
  createdAt: string;
  when: string;
};

export const toNotification = (n: any): NotificationItem => ({
  id: n.id,
  type: String(n.type ?? ''),
  title: n.title ?? '',
  body: n.body ?? '',
  actionUrl: n.action_url ?? undefined,
  read: !!n.read_at,
  createdAt: n.created_at,
  when: n.created_at ? fmtDateTime(n.created_at) : '',
});

export async function loadNotifications(): Promise<NotificationItem[]> {
  return (await request<any[]>('/notifications?limit=50')).map(toNotification);
}

export async function unreadCount(): Promise<number> {
  const r = await request<any>('/notifications/unread-count');
  return Number(r?.unread ?? 0);
}

export const markRead = (id: string) => request<any>(`/notifications/${id}/read`, { method: 'POST' });
export const markAllRead = () => request<any>('/notifications/read-all', { method: 'POST' });

// Мгновенно отмечает уведомление прочитанным в списке на экране (до ответа сервера).
export const applyRead = (list: NotificationItem[], id: string): NotificationItem[] =>
  list.map((n) => (n.id === id ? { ...n, read: true } : n));
export const applyReadAll = (list: NotificationItem[]): NotificationItem[] => list.map((n) => ({ ...n, read: true }));
export const countUnread = (list: NotificationItem[]) => list.filter((n) => !n.read).length;

// Ссылку из уведомления открываем в WebView, только если это путь сайта (/orders/...).
export const isSitePath = (url?: string) => !!url && url.startsWith('/') && !url.startsWith('//');

// ---- приглашения в команду мероприятия ----
export type InvitationItem = {
  id: string;
  eventTitle: string;
  roleLabel: string;
  status: string;
  pending: boolean;
  expiresAt: string;
  expires: string;
};

const ROLE_LABELS: Record<string, string> = {
  EVENT_ADMIN: 'Event admin (check-in)',
  EVENT_SUPPORT: 'Event support',
};

export const toInvitation = (i: any): InvitationItem => {
  const status = String(i.status ?? '').toUpperCase();
  const expired = i.expires_at ? new Date(i.expires_at).getTime() < Date.now() : false;
  return {
    id: i.id,
    eventTitle: i.event_title,
    roleLabel: ROLE_LABELS[i.invited_role] ?? String(i.invited_role ?? '').replace(/_/g, ' ').toLowerCase(),
    status,
    pending: status === 'PENDING' && !expired,
    expiresAt: i.expires_at,
    expires: i.expires_at ? fmtDateTime(i.expires_at) : '',
  };
};

export async function loadInvitations(): Promise<InvitationItem[]> {
  return (await request<any[]>('/staff-invitations/mine')).map(toInvitation);
}

export const acceptInvitation = (id: string) => request<any>(`/staff-invitations/${id}/accept`, { method: 'POST' });
export const declineInvitation = (id: string) => request<any>(`/staff-invitations/${id}/decline`, { method: 'POST' });
