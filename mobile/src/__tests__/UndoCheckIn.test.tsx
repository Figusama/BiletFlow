import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import UndoCheckIn, { UNDO_REASONS } from '../components/UndoCheckIn';

const result = { status: 'valid' as const, attendee: 'Aruzhan Serikova', ticketId: 'u1', publicId: 'BF-T-3K8P2Q' };

describe('UndoCheckIn', () => {
  it('показывает вопрос и все причины', async () => {
    await render(<UndoCheckIn result={result} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByText('Undo this check-in?')).toBeTruthy();
    UNDO_REASONS.forEach((r) => expect(screen.getByText(r)).toBeTruthy());
  });

  it('по умолчанию отправляет первую причину', async () => {
    const onConfirm = jest.fn();
    await render(<UndoCheckIn result={result} onConfirm={onConfirm} onCancel={jest.fn()} />);
    await fireEvent.press(screen.getByText('Undo check-in'));
    expect(onConfirm).toHaveBeenCalledWith(UNDO_REASONS[0]);
  });

  it('отправляет выбранную причину', async () => {
    const onConfirm = jest.fn();
    await render(<UndoCheckIn result={result} onConfirm={onConfirm} onCancel={jest.fn()} />);
    await fireEvent.press(screen.getByText('Other reason'));
    await fireEvent.press(screen.getByText('Undo check-in'));
    expect(onConfirm).toHaveBeenCalledWith('Other reason');
  });

  it('Keep it вызывает onCancel', async () => {
    const onCancel = jest.fn();
    await render(<UndoCheckIn result={result} onConfirm={jest.fn()} onCancel={onCancel} />);
    await fireEvent.press(screen.getByText('Keep it'));
    expect(onCancel).toHaveBeenCalled();
  });
});
