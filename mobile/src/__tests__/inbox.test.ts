jest.mock('../api/client', () => ({
  BASE_URL: 'http://test',
  request: jest.fn(),
}));

import { request } from '../api/client';
import {
  acceptInvitation, applyRead, applyReadAll, countUnread, declineInvitation, isSitePath, loadInvitations,
  loadNotifications, markAllRead, markRead, toInvitation, toNotification, unreadCount,
} from '../api/inbox';

const req = request as jest.Mock;
beforeEach(() => req.mockReset());

const note = (id: string, read_at: string | null = null) => ({
  id, type: 'order', title: `T${id}`, body: 'b', action_url: '/orders/1', read_at, created_at: '2026-11-25T10:00:00Z',
});

describe('inbox: уведомления', () => {
  it('приводит поля и определяет прочитанность по read_at', async () => {
    req.mockResolvedValue([note('1'), note('2', '2026-11-25T11:00:00Z')]);
    const list = await loadNotifications();
    expect(req.mock.calls[0][0]).toBe('/notifications?limit=50');
    expect(list.map((n) => n.read)).toEqual([false, true]);
    expect(list[0]).toMatchObject({ id: '1', title: 'T1', actionUrl: '/orders/1' });
  });

  it('unreadCount читает поле unread, при пустом ответе 0', async () => {
    req.mockResolvedValue({ unread: 4 });
    expect(await unreadCount()).toBe(4);
    req.mockResolvedValue(undefined);
    expect(await unreadCount()).toBe(0);
  });

  it('markRead и markAllRead — POST на нужные адреса', async () => {
    req.mockResolvedValue({});
    await markRead('n7');
    await markAllRead();
    expect(req.mock.calls[0][0]).toBe('/notifications/n7/read');
    expect(req.mock.calls[0][1].method).toBe('POST');
    expect(req.mock.calls[1][0]).toBe('/notifications/read-all');
  });

  it('applyRead / applyReadAll / countUnread работают без мутации', () => {
    const list = [toNotification(note('1')), toNotification(note('2'))];
    const one = applyRead(list, '1');
    expect(countUnread(list)).toBe(2);
    expect(countUnread(one)).toBe(1);
    expect(countUnread(applyReadAll(list))).toBe(0);
  });

  it('isSitePath пропускает только пути сайта', () => {
    expect(isSitePath('/orders/1')).toBe(true);
    expect(isSitePath('//evil.example')).toBe(false);
    expect(isSitePath('https://evil.example')).toBe(false);
    expect(isSitePath(undefined)).toBe(false);
  });
});

describe('inbox: приглашения', () => {
  const inv = (over: any = {}) => ({
    id: 'i1', event_id: 'e1', event_title: 'Seed Check-in Test', invited_role: 'EVENT_ADMIN', status: 'PENDING',
    expires_at: new Date(Date.now() + 86400000).toISOString(), created_at: 'x', ...over,
  });

  it('ожидающее приглашение получает подпись роли и pending=true', () => {
    expect(toInvitation(inv())).toMatchObject({ pending: true, roleLabel: 'Event admin (check-in)', eventTitle: 'Seed Check-in Test' });
  });

  it('просроченное или уже обработанное приглашение не pending', () => {
    expect(toInvitation(inv({ expires_at: '2020-01-01T00:00:00Z' })).pending).toBe(false);
    expect(toInvitation(inv({ status: 'ACCEPTED' })).pending).toBe(false);
  });

  it('loadInvitations, accept и decline обращаются к нужным адресам', async () => {
    req.mockResolvedValue([inv()]);
    const list = await loadInvitations();
    expect(req.mock.calls[0][0]).toBe('/staff-invitations/mine');
    expect(list).toHaveLength(1);
    req.mockResolvedValue({});
    await acceptInvitation('i1');
    await declineInvitation('i2');
    expect(req.mock.calls[1][0]).toBe('/staff-invitations/i1/accept');
    expect(req.mock.calls[2][0]).toBe('/staff-invitations/i2/decline');
  });
});
