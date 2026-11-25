import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import TabBar, { TABS, tabsFor } from '../components/TabBar';

describe('TabBar', () => {
  it('показывает все вкладки', async () => {
    await render(<TabBar active="discover" onChange={jest.fn()} />);
    TABS.forEach((t) => expect(screen.getByText(t.label)).toBeTruthy());
  });
  it('вызывает onChange с ключом вкладки', async () => {
    const onChange = jest.fn();
    await render(<TabBar active="discover" onChange={onChange} />);
    await fireEvent.press(screen.getByText('Tickets'));
    expect(onChange).toHaveBeenCalledWith('tickets');
    await fireEvent.press(screen.getByText('Check-in'));
    expect(onChange).toHaveBeenCalledWith('checkin');
    await fireEvent.press(screen.getByText('Inbox'));
    expect(onChange).toHaveBeenCalledWith('inbox');
  });
  it('обычному пользователю вкладка Admin не показывается', async () => {
    await render(<TabBar active="discover" onChange={jest.fn()} />);
    expect(screen.queryByText('Admin')).toBeNull();
  });
  it('PLATFORM_ADMIN видит Admin перед More', async () => {
    expect(tabsFor(true).map((t) => t.key)).toEqual(['discover', 'tickets', 'inbox', 'checkin', 'admin', 'more']);
    const onChange = jest.fn();
    await render(<TabBar active="discover" onChange={onChange} isAdmin />);
    await fireEvent.press(screen.getByText('Admin'));
    expect(onChange).toHaveBeenCalledWith('admin');
  });
  it('значок непрочитанных: число, 9+ и ничего при нуле', async () => {
    const { rerender } = await render(<TabBar active="discover" onChange={jest.fn()} badges={{ inbox: 3 }} />);
    expect(screen.getByText('3')).toBeTruthy();
    await rerender(<TabBar active="discover" onChange={jest.fn()} badges={{ inbox: 25 }} />);
    expect(screen.getByText('9+')).toBeTruthy();
    await rerender(<TabBar active="discover" onChange={jest.fn()} badges={{ inbox: 0 }} />);
    expect(screen.queryByText('0')).toBeNull();
  });
});
