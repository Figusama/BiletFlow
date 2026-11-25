jest.mock('../api/client', () => ({
  BASE_URL: 'http://test',
  request: jest.fn(),
}));

import { request } from '../api/client';
import { fmtPrice } from '../format';
import {
  approve, reject, loadQueue, loadCounts, getMyRole, searchUsers, suspendEvent, toRefund, retryRefund,
  QueueItem,
} from '../api/admin';

const req = request as jest.Mock;
beforeEach(() => req.mockReset());

const item = (kind: QueueItem['kind'], id = 'x1'): QueueItem => ({ id, kind, title: 't', subtitle: '', lines: [], decidable: true });
const body = () => JSON.parse(req.mock.calls[0][1].body);

describe('admin: очереди', () => {
  it('заявки загружаются со статусом PENDING и приводятся к карточкам', async () => {
    req.mockResolvedValue([{ id: 'a1', application_number: 'APP-1', title: 'Fest', venue_name_snapshot: 'Hall', venue_city_snapshot: 'Astana', responsible_name: 'Ali', responsible_email: 'a@b.kz', intends_paid_sales: true, starts_at: '2026-12-01T10:00:00Z' }]);
    const list = await loadQueue('applications');
    expect(req.mock.calls[0][0]).toBe('/admin/event-applications?status=PENDING&limit=50');
    expect(list[0]).toMatchObject({ id: 'a1', kind: 'applications', title: 'Fest', subtitle: 'APP-1' });
    expect(list[0].lines.join('|')).toContain('Plans paid sales');
  });

  it('возвраты запрашиваются со статусом PENDING_ADMIN', async () => {
    req.mockResolvedValue([]);
    await loadQueue('refunds');
    expect(req.mock.calls[0][0]).toBe('/admin/refund-requests?status=PENDING_ADMIN&limit=50');
  });

  it('возврат с ошибкой выплаты получает кнопку Retry', () => {
    const r = toRefund({ id: 'r1', order_number: 'BF-O-1', amount_minor: 500000, source: 'CUSTOMER', status: 'APPROVED', execution_status: 'FAILED', created_at: '2026-11-01T00:00:00Z' });
    expect(r.canRetry).toBe(true);
    expect(r.decidable).toBe(false);
    expect(r.subtitle).toContain(fmtPrice(500000));
  });

  it('счётчики: упавшая очередь даёт null, остальные считаются', async () => {
    req.mockImplementation(async (path: string) => {
      if (path.startsWith('/admin/change-requests')) throw new Error('boom');
      return [{ id: '1' }, { id: '2' }];
    });
    const c = await loadCounts();
    expect(c.changes).toBeNull();
    expect(c.applications).toBe(2);
  });
});

describe('admin: решения', () => {
  it('approve заявки отправляет confirm_responsible_organizer', async () => {
    req.mockResolvedValue({});
    await approve(item('applications'));
    expect(req.mock.calls[0][0]).toBe('/admin/event-applications/x1/approve');
    expect(body()).toEqual({ confirm_responsible_organizer: true });
  });

  it('approve отмены передаёт выбранный режим возвратов', async () => {
    req.mockResolvedValue({});
    await approve(item('cancellations'), { refundMode: 'AUTOMATIC_FULL' });
    expect(req.mock.calls[0][0]).toBe('/admin/cancellation-requests/x1/approve');
    expect(body()).toEqual({ refund_handling_mode: 'AUTOMATIC_FULL' });
  });

  it('approve платных продаж идёт без тела', async () => {
    req.mockResolvedValue({});
    await approve(item('paidSales'));
    expect(req.mock.calls[0][0]).toBe('/admin/paid-sales/requests/x1/approve');
    expect(req.mock.calls[0][1].body).toBeUndefined();
  });

  it.each([
    ['applications', '/admin/event-applications/x1/reject', 'review_comment'],
    ['changes', '/admin/change-requests/x1/reject', 'review_comment'],
    ['paidSales', '/admin/paid-sales/requests/x1/reject', 'reason'],
    ['cancellations', '/admin/cancellation-requests/x1/reject', 'review_comment'],
    ['refunds', '/refund-requests/x1/reject', 'comment'],
  ] as const)('reject %s использует нужное поле причины', async (kind, path, field) => {
    req.mockResolvedValue({});
    await reject(item(kind), '  Not enough details  ');
    expect(req.mock.calls[0][0]).toBe(path);
    expect(body()).toEqual({ [field]: 'Not enough details' });
  });

  it('retry возврата — POST без тела', async () => {
    req.mockResolvedValue({});
    await retryRefund('r9');
    expect(req.mock.calls[0][0]).toBe('/admin/refund-requests/r9/retry');
  });
});

describe('admin: пользователи, события, роль', () => {
  it('поиск пользователей кодирует запрос', async () => {
    req.mockResolvedValue([{ id: 'u1', public_id: 'U-1', email: 'a@b.kz', full_name: null, personal_role: 'USER', is_suspended: true }]);
    const rows = await searchUsers('a b');
    expect(req.mock.calls[0][0]).toBe('/admin/users?limit=50&q=a%20b');
    expect(rows[0]).toMatchObject({ id: 'u1', suspended: true, name: '' });
  });

  it('блокировка события отправляет причину без пробелов по краям', async () => {
    req.mockResolvedValue({});
    await suspendEvent('e1', ' Fraud suspicion ');
    expect(req.mock.calls[0][0]).toBe('/admin/events/e1/suspend');
    expect(body()).toEqual({ reason: 'Fraud suspicion' });
  });

  it('getMyRole читает personal_role', async () => {
    req.mockResolvedValue({ personal_role: 'PLATFORM_ADMIN' });
    expect(await getMyRole()).toBe('PLATFORM_ADMIN');
    expect(req.mock.calls[0][0]).toBe('/users/me');
  });
});
