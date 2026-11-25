import * as SecureStore from 'expo-secure-store';
import { setOnline } from '../session';
import { API_URL } from '../env';

// Адрес бэкенда задаётся в mobile\.env.local (EXPO_PUBLIC_HOST), см. src/env.ts
export const BASE_URL = API_URL;

let token: string | null = null;
let onAuthLost: (() => void) | null = null;

export const setOnAuthLost = (fn: () => void) => { onAuthLost = fn; };

export const setToken = async (t: string | null) => {
  token = t;
  if (t) await SecureStore.setItemAsync('token', t);
  else await SecureStore.deleteItemAsync('token');
};

export const loadToken = async () => {
  token = await SecureStore.getItemAsync('token');
  return token;
};

async function refreshToken(): Promise<boolean> {
  try {
    const res = await fetch(BASE_URL + '/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!res.ok) return false;
    const data = await res.json();
    await setToken(data.access_token);
    return true;
  } catch {
    return false;
  }
}

function errorText(body: string, status: number): string {
  try {
    const j = JSON.parse(body);
    if (typeof j.detail === 'string') return j.detail;
    if (j.detail?.problems) return j.detail.problems.join('; ');
    if (Array.isArray(j.detail)) return j.detail.map((d: any) => d.msg).join('; ');
  } catch {}
  return body || `HTTP ${status}`;
}

export async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE_URL + path, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    setOnline(false);
    throw new Error('Нет связи с сервером. Проверьте Wi-Fi и адрес бэкенда.');
  }
  setOnline(true);
  if (res.status === 401 && retry && token) {
    if (await refreshToken()) return request<T>(path, options, false);
    await setToken(null);
    onAuthLost?.();
    throw new Error('Сессия истекла, войдите снова');
  }
  if (!res.ok) throw new Error(errorText(await res.text(), res.status));
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
