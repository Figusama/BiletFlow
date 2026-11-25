import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { frameColor } from '../components/ResultCard';
import ResultCard from '../components/ResultCard';
import { ScanResult } from '../types';

const TITLES: [ScanResult['status'], string][] = [
  ['valid', 'Valid'],
  ['already_used', 'Already used'],
  ['refunded', 'Refunded'],
  ['cancelled', 'Cancelled'],
  ['invalid', 'Not recognised'],
  ['campaign_qr', 'Not a ticket'],
  ['wrong_event', 'Other event'],
  ['event_cancelled', 'Event cancelled'],
  ['event_not_active', 'Event has ended'],
  ['event_suspended', 'Check-in paused'],
];

describe('ResultCard', () => {
  it.each(TITLES)('статус %s показывает заголовок "%s"', async (status, title) => {
    await render(<ResultCard result={{ status }} />);
    expect(screen.getByText(title)).toBeTruthy();
  });

  it('неизвестный статус не падает и показывает Not recognised', async () => {
    await render(<ResultCard result={{ status: 'brand_new' as any }} />);
    expect(screen.getByText('Not recognised')).toBeTruthy();
  });

  it('показывает имя, место и читаемый номер билета', async () => {
    await render(
      <ResultCard
        result={{ status: 'valid', attendee: 'Aruzhan Serikova', seat: 'VIP · Row B', publicId: 'BF-T-3K8P2Q', ticketId: 'uuid-1' }}
      />,
    );
    expect(screen.getByText('Aruzhan Serikova')).toBeTruthy();
    expect(screen.getByText('VIP · Row B')).toBeTruthy();
    expect(screen.getByText('BF-T-3K8P2Q')).toBeTruthy();
  });

  it('без publicId показывает ticketId', async () => {
    await render(<ResultCard result={{ status: 'valid', ticketId: 'uuid-1' }} />);
    expect(screen.getByText('uuid-1')).toBeTruthy();
  });

  it('цвет рамки зависит от статуса', () => {
    expect(frameColor('valid')).not.toBe(frameColor('cancelled'));
    expect(frameColor('already_used')).not.toBe(frameColor('valid'));
    expect(frameColor(undefined)).toBe('#B2A3E0');
    expect(frameColor('something_new')).toBe(frameColor('invalid'));
  });
});
