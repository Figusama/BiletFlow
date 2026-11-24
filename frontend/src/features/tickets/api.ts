import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api/client'

export type SaleState = 'ON_SALE' | 'SOLD_OUT' | 'NOT_STARTED' | 'ENDED' | 'PAUSED' | 'DISABLED' | 'NOT_ON_SALE'

export interface TicketType {
    id: string
    event_id: string
    name: string
    description: string | null
    kind: 'FREE' | 'PAID'
    price_minor: number
    quantity_total: number | null
    sales_start_at: string
    sales_end_at: string
    max_per_order: number
    sale_state: SaleState
    available: number | null
}

export interface Reservation {
    id: string
    event_id: string
    expires_at: string
}

export const ticketTypesQuery = (eventId: string | undefined) => ({
    queryKey: ['ticket-types', eventId],
    queryFn: () => api<TicketType[]>(`/events/${eventId}/ticket-types`),
    enabled: Boolean(eventId),
})

export const useTicketTypes = (eventId: string | undefined) => useQuery(ticketTypesQuery(eventId))

export interface ReservationLine {
    ticket_type_id: string
    quantity: number
}

export const createReservation = (eventId: string, items: ReservationLine[]) =>
    api<Reservation>(`/events/${eventId}/reservations`, {
        method: 'POST',
        json: { items },
    })
