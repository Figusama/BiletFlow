const BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';


let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
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


export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
    const { json, form, headers, idempotencyKey, ...rest } = init
    const response = await fetch(`${BASE}${path}`, {
        ...rest,
        body: form ?? JSON.stringify(json),
        headers: {
            ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
            ...headers,
        },
    })

    
    if (!response.ok) {
        const body = await response.json().catch(() => null)
        const detail = body?.detail
        const message = typeof detail === 'string' ? detail : body?.title ?? response.statusText
        throw new ApiError(response.status, message, body)
    }

    if (response.status === 204) {
        return undefined  as T
    }

    return response.json() as Promise<T>
}
