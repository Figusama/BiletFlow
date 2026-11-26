jest.mock('../api/client', () => ({
  BASE_URL: 'http://backend.test:8000',
  request: jest.fn(),
}));

import { request } from '../api/client';
import {
  canPublish, canUnpublish, getManagedEvent, getManagedTicketTypes, getPaidSales, getSalesSummary, paidSalesText,
  publishEvent, soldText, statusInfo, toManagedEvent, unpublishEvent,
} from '../api/myEvents';

const req = request as jest.Mock;
beforeEach(() => req.mockReset());

const raw = {
  id: 'e1', title: 'Demo', status: 'draft', is_suspended: false, starts_at: '2026-12-01T10:00:00Z',
  ends_at: '2026-12-01T12:00:00Z', timezone: 'Asia/Almaty', venue_name: 'Hall', venue_city: 'Almaty', seating_mode: 'GENERAL_ADMISSION',
};

describe('My events', () => {
  it('toManagedEvent приводит поля и статус к верхнему регистру', () => {
    const e = toManagedEvent(raw);
    expect(e).toMatchObject({ id: 'e1', status: 'DRAFT', venue: 'Hall, Almaty', isSuspended: false });
  });

  it('statusInfo: приостановка важнее статуса, неизвестный статус не ломается', () => {
    expect(statusInfo('PUBLISHED')).toEqual({ label: 'Published', tone: 'success' });
    expect(statusInfo('DRAFT')).toEqual({ label: 'Draft', tone: 'neutral' });
    expect(statusInfo('PUBLISHED', true)).toEqual({ label: 'Suspended', tone: 'danger' });
    expect(statusInfo('CANCELLED').tone).toBe('danger');
    expect(statusInfo('WEIRD').label).toBe('WEIRD');
  });

  it('canPublish / canUnpublish зависят от статуса и приостановки', () => {
    expect(canPublish({ status: 'DRAFT', isSuspended: false })).toBe(true);
    expect(canPublish({ status: 'PUBLISHED', isSuspended: false })).toBe(false);
    expect(canPublish({ status: 'DRAFT', isSuspended: true })).toBe(false);
    expect(canUnpublish({ status: 'PUBLISHED', isSuspended: false })).toBe(true);
    expect(canUnpublish({ status: 'CANCELLED', isSuspended: false })).toBe(false);
  });

  it('getManagedEvent и publish/unpublish ходят на нужные адреса', async () => {
    req.mockResolvedValue(raw);
    await getManagedEvent('e1');
    expect(req).toHaveBeenLastCalledWith('/events/e1/manage');
    await publishEvent('e1');
    expect(req).toHaveBeenLastCalledWith('/events/e1/publish', { method: 'POST' });
    await unpublishEvent('e1');
    expect(req).toHaveBeenLastCalledWith('/events/e1/unpublish', { method: 'POST' });
  });

  it('типы билетов и строка «продано»', async () => {
    req.mockResolvedValueOnce([
      { id: 't1', name: 'Free', kind: 'free', price_minor: 0, quantity_total: 100, available: 88, is_active: true, sale_state: 'ON_SALE' },
      { id: 't2', name: 'VIP', kind: 'paid', price_minor: 500000, quantity_total: null, available: null, is_active: false, sale_state: 'PAUSED' },
    ]);
    const types = await getManagedTicketTypes('e1');
    expect(req).toHaveBeenCalledWith('/events/e1/ticket-types/manage');
    expect(types[0]).toMatchObject({ priceMinor: 0, active: true, kind: 'FREE' });
    expect(types[1].active).toBe(false);
    expect(soldText(types[0])).toBe('12 / 100 sold');
    expect(soldText({ total: null, available: null })).toBe('');
    expect(soldText({ total: null, available: 5 })).toBe('5 left');
  });

  it('getSalesSummary: читает аналитику, а при отказе (нет прав) возвращает null', async () => {
    req.mockResolvedValueOnce({
      inventory: { sold: 12, capacity: 100 },
      financial: { gross_sales_minor: 600000, net_revenue_minor: 550000, is_demonstration: true },
    });
    expect(await getSalesSummary('e1')).toEqual({ sold: 12, capacity: 100, grossMinor: 600000, netMinor: 550000, demo: true });
    req.mockRejectedValueOnce(new Error('403'));
    expect(await getSalesSummary('e1')).toBeNull();
  });

  it('платные продажи: активированы, приостановлены, не активированы, нет прав', async () => {
    req.mockResolvedValueOnce({ status: 'ACTIVE', activated_at: '2026-11-20T10:00:00Z', suspended_at: null });
    const on = await getPaidSales('e1');
    expect(on).toEqual({ status: 'ACTIVE', activated: true, suspended: false });
    expect(paidSalesText(on)).toBe('Paid sales are on');
    req.mockResolvedValueOnce({ status: 'SUSPENDED', activated_at: '2026-11-20T10:00:00Z', suspended_at: '2026-11-21T10:00:00Z' });
    expect(paidSalesText(await getPaidSales('e1'))).toBe('Paid sales are suspended');
    req.mockResolvedValueOnce({ status: 'NOT_ACTIVATED', activated_at: null, suspended_at: null });
    expect(paidSalesText(await getPaidSales('e1'))).toBe('Paid sales are not activated yet');
    req.mockRejectedValueOnce(new Error('403'));
    expect(await getPaidSales('e1')).toBeNull();
    expect(paidSalesText(null)).toBe('');
  });
});
