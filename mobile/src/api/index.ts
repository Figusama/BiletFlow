import { mockApi } from './mock';
import { realApi } from './real';

export const MOCK = false; // true = работать на моках без бэкенда

export const api = MOCK ? mockApi : realApi;
