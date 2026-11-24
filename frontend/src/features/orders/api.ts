import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api/client'

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED'

export interface ReservationItem {
    ticket_type_id: string
    event_seat_id: string | null
    quantity: number
}

export interface ReservationDetails {
    id: string
    event_id: string
    status: 'ACTIVE' | 'PROTECTED' | 'CONVERTED' | 'RELEASED'
    expires_at: string
    is_expired: boolean
    items: ReservationItem[]
}

export interface OrderItem {
    id: string
    ticket_type_name: string
    seat_label: string | null
    unit_price_minor: number
    quantity: number
    line_subtotal_minor: number
}

export interface Order {
    id: string
    order_number: string
    event_id: string
    event_title: string
    status: OrderStatus
    subtotal_minor: number
    discount_minor: number
    total_minor: number
    promo_code: string | null
    requires_payment: boolean
    reservation_expires_at: string
    items: OrderItem[]
}

export interface Payment {
    id: string
    status: 'PENDING' | 'AUTHORIZED' | 'CAPTURING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
    payment_url: string | null
}

export interface PromoQuote {
    valid: boolean
    code: string
    subtotal_minor: number
    discount_minor: number
    total_minor: number
}

const ORDER_POLL_MS = 3000

export const useReservation = (reservationId: string) =>
    useQuery({
        queryKey: ['reservations', reservationId],
        queryFn: () => api<ReservationDetails>(`/reservations/${reservationId}`),
        retry: false,
    })

export const useOrder = (orderId: string) =>
    useQuery({
        queryKey: ['orders', orderId],
        queryFn: () => api<Order>(`/orders/${orderId}`),
        retry: false,
        refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? ORDER_POLL_MS : false),
    })

export const releaseReservation = (reservationId: string) =>
    api<void>(`/reservations/${reservationId}`, { method: 'DELETE' })

export const validatePromo = (reservationId: string, code: string) =>
    api<PromoQuote>('/promo-codes/validate', {
        method: 'POST',
        json: { reservation_id: reservationId, code },
    })

export const createOrder = (reservationId: string, promoCode: string | null) =>
    api<Order>(`/reservations/${reservationId}/order`, {
        method: 'POST',
        json: { promo_code: promoCode },
    })

export const startPayment = (orderId: string) =>
    api<Payment>(`/orders/${orderId}/payments`, {
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
    })
