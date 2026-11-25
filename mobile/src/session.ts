import { useEffect, useState } from 'react';

// ---- индикатор Online / Offline (обновляется по результатам запросов к API) ----
let online = true;
const subs = new Set<(v: boolean) => void>();

export const setOnline = (v: boolean) => {
  if (v === online) return;
  online = v;
  subs.forEach((f) => f(v));
};

export const useOnline = () => {
  const [v, setV] = useState(online);
  useEffect(() => {
    subs.add(setV);
    setV(online);
    return () => {
      subs.delete(setV);
    };
  }, []);
  return v;
};

// ---- email для инициалов в аватаре ----
let email = '';
export const setSessionEmail = (e: string) => {
  email = e;
};
export const sessionInitials = () => {
  const name = email.split('@')[0].replace(/[^a-zA-Z]/g, '');
  return (name.slice(0, 2) || 'ME').toUpperCase();
};

// ---- счётчик «This device»: сколько билетов отметили на этом телефоне ----
const deviceCounts = new Map<string, number>();
export const deviceCount = (eventId: string) => deviceCounts.get(eventId) ?? 0;
export const bumpDevice = (eventId: string, delta: number) => {
  deviceCounts.set(eventId, Math.max(0, deviceCount(eventId) + delta));
};
