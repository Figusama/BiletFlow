import { fmtDateTime, fmtNumber, fmtPrice } from '../format';

describe('format', () => {
  it('fmtNumber добавляет тонкие пробелы', () => {
    expect(fmtNumber(1412)).toBe('1 412');
    expect(fmtNumber(842)).toBe('842');
  });
  it('fmtPrice: 0 -> Free, тиыны -> тенге', () => {
    expect(fmtPrice(0)).toBe('Free');
    expect(fmtPrice(1200000)).toBe('12 000 ₸');
  });
  it('fmtDateTime показывает дату и время в часовом поясе события', () => {
    expect(fmtDateTime('2026-11-14T14:00:00Z', 'UTC')).toBe('Sat 14 Nov · 14:00');
    expect(fmtDateTime('2026-11-14T14:00:00Z', 'Asia/Almaty')).toBe('Sat 14 Nov · 19:00');
  });
  it('fmtDateTime не падает на мусоре', () => {
    expect(typeof fmtDateTime('not-a-date')).toBe('string');
  });
});
