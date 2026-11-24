import { useQuery } from '@tanstack/react-query'
import { api, apiBlob } from '../../shared/api/client'

export type SaleState = 'ON_SALE' | 'SOLD_OUT' | 'NOT_STARTED' | 'ENDED' | 'PAUSED' | 'DISABLED' | 'NOT_ON_SALE'

export type TicketTypeColor = 'violet' | 'amber' | 'sky' | 'orange' | 'lime' | 'pink' | 'emerald' | 'rose'

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
    color?: TicketTypeColor | null
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

export type ReservationRequest = { items: ReservationLine[] } | { event_seat_ids: string[] }

export const createReservation = (eventId: string, request: ReservationRequest) =>
    api<Reservation>(`/events/${eventId}/reservations`, {
        method: 'POST',
        json: request,
    })

export type SeatState = 'AVAILABLE' | 'TAKEN' | 'UNAVAILABLE'

export interface Seat {
    id: string
    section: string
    row: string
    seat_number: string
    is_accessible: boolean
    ticket_type_id: string | null
    state: SeatState
}

export const useSeats = (eventId: string | undefined, enabled: boolean) =>
    useQuery({
        queryKey: ['seats', eventId],
        queryFn: () => api<Seat[]>(`/events/${eventId}/seats`),
        enabled: Boolean(eventId) && enabled,
    })

export type TicketStatus = 'VALID' | 'CHECKED_IN' | 'CANCELLED' | 'REFUNDED'

export interface Ticket {
    id: string
    public_id: string
    event_id: string
    event_title: string
    event_starts_at: string
    event_timezone: string
    venue_name: string
    order_id: string
    order_number: string
    ticket_type_name: string
    attendee_name: string
    seat_label: string | null
    status: TicketStatus
    checked_in_at: string | null
}

export const useMyTickets = (enabled = true) =>
    useQuery({
        queryKey: ['tickets', 'mine'],
        queryFn: () => api<Ticket[]>('/tickets/mine'),
        enabled,
    })

export const fetchTicketFile = (ticketId: string, file: 'qr.png' | 'pdf') => apiBlob(`/tickets/${ticketId}/${file}`)
