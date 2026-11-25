import { WEB_BASE_URL } from './env';

// Адрес САЙТА (Vite, порт 5173) в вашей Wi-Fi сети. Сайт нужно запускать с --host.
// Задаётся в mobile\.env.local (EXPO_PUBLIC_HOST), см. src/env.ts
export const WEB_URL = WEB_BASE_URL;

// Страницы сайта, которые открываются внутри приложения (вкладка More).
// Адреса взяты из router.tsx ветки feature/frontend-redesign.
export const WEB_ROUTES = [
  { key: 'site', title: 'BiletFlow website', path: '/', icon: '🌐' },
  { key: 'tickets', title: 'My tickets on the website', path: '/tickets', icon: '🎟' },
  { key: 'org-events', title: 'Organizer: my events', path: '/organizer/events', icon: '🗂' },
  { key: 'org-new', title: 'Organizer: create an event', path: '/organizer/events/new', icon: '➕' },
  { key: 'help', title: 'Help', path: '/help', icon: '❓' },
  { key: 'register', title: 'Create an account', path: '/auth/register', icon: '✍️' },
];
