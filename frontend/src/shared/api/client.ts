const BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

// Токен хранится в памяти модуля, а не в localStorage: после перезагрузки страницы он пропадает
let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
}

// Ошибка HTTP-ответа: кроме текста хранит статус и тело, чтобы UI мог различать 401 / 404 / 409 и т.д.
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

// Опции как у fetch, но body заменён на json (сериализуем сами), а headers упрощены до обычного объекта
type ApiInit = Omit<RequestInit, 'body' | 'headers'> & {
    json?: unknown;
    headers?: Record<string, string>;
    // Уникальный ключ операции: сервер не выполнит её дважды при повторной отправке (важно для покупки билета)
    idempotencyKey?: string;
}

// Единая обёртка над fetch: T — тип ожидаемого ответа, например api<Event[]>('/events')
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
    const { json, headers, idempotencyKey, ...rest } = init
    const response = await fetch(`${BASE}${path}`, {
        ...rest,
        body: json === undefined ? undefined : JSON.stringify(json),
        headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
            ...headers,
        },
    })

    // fetch не бросает ошибку на 4xx/5xx — проверяем сами и превращаем в ApiError
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
