const BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';


let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
}

let onSessionExpired: () => void = () => {};
export const setSessionExpiredHandler = (handler: () => void) => {
  onSessionExpired = handler;
}

export class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, message: string, body?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.body = body;
    }
}

type ApiInit = Omit<RequestInit, 'body' | 'headers'> & {
    json?: unknown;
    form?: URLSearchParams;
    headers?: Record<string, string>;
    idempotencyKey?: string;
}

const REQUEST_TIMEOUT_MS = 20_000

const AUTH_PATHS_WITHOUT_REFRESH = ['/auth/token', '/auth/refresh', '/auth/logout']

let refreshPromise: Promise<boolean> | null = null

export const refreshAccessToken = (): Promise<boolean> => {
    refreshPromise ??= fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
        .then(async (response) => {
            if (!response.ok) return false
            const data: { access_token: string } = await response.json()
            setAccessToken(data.access_token)
            return true
        })
        .catch(() => false)
        .finally(() => {
            refreshPromise = null
        })

    return refreshPromise
}

const send = (path: string, init: ApiInit) => {
    const { json, form, headers, idempotencyKey, ...rest } = init
    return fetch(`${BASE}${path}`, {
        ...rest,
        signal: rest.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        credentials: 'include',
        body: form ?? JSON.stringify(json),
        headers: {
            ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
            ...headers,
        },
    })
}

const request = async (path: string, init: ApiInit): Promise<Response> => {
    let response = await send(path, init)

    const canRefresh = accessToken !== null && !AUTH_PATHS_WITHOUT_REFRESH.includes(path)
    if (response.status === 401 && canRefresh) {
        if (await refreshAccessToken()) {
            response = await send(path, init)
        } else {
            setAccessToken(null)
            onSessionExpired()
        }
    }

    if (!response.ok) {
        const body = await response.json().catch(() => null)
        const detail = body?.detail
        const message = typeof detail === 'string' ? detail : body?.title ?? response.statusText
        throw new ApiError(response.status, message, body)
    }

    return response
}

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
    const response = await request(path, init)

    if (response.status === 204) {
        return undefined as T
    }

    return response.json() as Promise<T>
}

export async function apiBlob(path: string): Promise<Blob> {
    const response = await request(path, {})
    return response.blob()
}
