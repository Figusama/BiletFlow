// Адреса бэкенда и сайта берутся из настроек Expo (файл mobile\.env.local), а не из кода.
// При смене Wi-Fi меняется одна строка: EXPO_PUBLIC_HOST=<IP ноутбука>.
export type UrlEnv = {
  EXPO_PUBLIC_HOST?: string;
  EXPO_PUBLIC_API_URL?: string;
  EXPO_PUBLIC_WEB_URL?: string;
};

export const DEFAULT_HOST = 'localhost';

const strip = (s: string) => s.trim().replace(/\/+$/, '');

export function resolveUrls(env: UrlEnv = {}) {
  const host = (env.EXPO_PUBLIC_HOST || '').trim() || DEFAULT_HOST;
  return {
    api: env.EXPO_PUBLIC_API_URL?.trim() ? strip(env.EXPO_PUBLIC_API_URL) : `http://${host}:8000`,
    web: env.EXPO_PUBLIC_WEB_URL?.trim() ? strip(env.EXPO_PUBLIC_WEB_URL) : `http://${host}:5173`,
  };
}

// Expo подставляет EXPO_PUBLIC_* только при прямом обращении process.env.ИМЯ.
const urls = resolveUrls({
  EXPO_PUBLIC_HOST: process.env.EXPO_PUBLIC_HOST,
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_WEB_URL: process.env.EXPO_PUBLIC_WEB_URL,
});

export const API_URL = urls.api;
export const WEB_BASE_URL = urls.web;
