import type { Ticket, TicketStatus } from './api'

export interface TicketOrder {
    orderId: string
    eventId: string
    eventTitle: string
    startsAt: string
    timeZone: string
    venueName: string
    tickets: Ticket[]
    status: TicketStatus
}

const getOrderStatus = (tickets: Ticket[]): TicketStatus => {
    if (tickets.some((ticket) => ticket.status === 'VALID')) return 'VALID'
    if (tickets.some((ticket) => ticket.status === 'CHECKED_IN')) return 'CHECKED_IN'
    return tickets[0].status
}

export const groupByOrder = (tickets: Ticket[]): TicketOrder[] => {
    const byOrder = new Map<string, Ticket[]>()
    for (const ticket of tickets) {
        byOrder.set(ticket.order_id, [...(byOrder.get(ticket.order_id) ?? []), ticket])
    }

    return [...byOrder.values()].map((orderTickets) => {
        const first = orderTickets[0]
        return {
            orderId: first.order_id,
            eventId: first.event_id,
            eventTitle: first.event_title,
            startsAt: first.event_starts_at,
            timeZone: first.event_timezone,
            venueName: first.venue_name,
            tickets: orderTickets,
            status: getOrderStatus(orderTickets),
        }
    })
}

export const isCancelled = (order: TicketOrder) => order.status === 'CANCELLED' || order.status === 'REFUNDED'
