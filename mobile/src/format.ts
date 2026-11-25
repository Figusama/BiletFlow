export const fmtNumber = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// "Sat 14 Nov · 19:00" в часовом поясе события
export function fmtDateTime(iso: string, timeZone?: string): string {
  try {
    const d = new Date(iso);
    const date = d
      .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone })
      .replace(',', '');
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone });
    return `${date} · ${time}`;
  } catch {
    return iso;
  }
}

// price_minor хранится в минимальных единицах (тиын): 1 200 000 -> "12 000 ₸"
export function fmtPrice(priceMinor: number): string {
  if (!priceMinor) return 'Free';
  return `${fmtNumber(Math.round(priceMinor / 100))} ₸`;
}
