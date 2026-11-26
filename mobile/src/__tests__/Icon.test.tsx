import React from 'react';
import { render } from '@testing-library/react-native';
import Icon, { ICONS, IconName } from '../components/Icon';
import { TABS, ADMIN_TAB } from '../components/TabBar';
import { QUEUES } from '../api/admin';
import { WEB_ROUTES } from '../config';

describe('Icon', () => {
  it('рисует каждую иконку без ошибок', async () => {
    for (const name of Object.keys(ICONS) as IconName[]) {
      await render(<Icon name={name} />);
    }
  });
  it('все иконки табов, очередей и ссылок существуют и не пустые', () => {
    const used = [...TABS.map((t) => t.icon), ADMIN_TAB.icon, ...QUEUES.map((q) => q.icon), ...WEB_ROUTES.map((r) => r.icon)];
    used.forEach((n) => {
      expect(ICONS[n]).toBeDefined();
      expect(ICONS[n].paths.length).toBeGreaterThan(0);
    });
  });
});
