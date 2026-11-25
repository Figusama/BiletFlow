import type { ManagedEvent, ManagedTicketType, PaidSales } from './api'

export type ReadinessKey = 'details' | 'contact' | 'ticketTypes' | 'salesWindows' | 'capacity' | 'paidSales' | 'notEnded'
export type ReadinessState = 'done' | 'missing' | 'blocked'

export interface ReadinessCheck {
    key: ReadinessKey
    state: ReadinessState
}

const doneIf = (condition: boolean): ReadinessState => (condition ? 'done' : 'missing')

export const getReadiness = (
    event: ManagedEvent,
    ticketTypes: ManagedTicketType[],
    paidSales: PaidSales | undefined,
    now = Date.now(),
): ReadinessCheck[] => {
    const activeTypes = ticketTypes.filter((type) => type.is_active)
    const endsAt = new Date(event.ends_at).getTime()
    const hasPaidTypes = ticketTypes.some((type) => type.kind === 'PAID')

    return [
        { key: 'details', state: doneIf(Boolean(event.description) && event.categories.length > 0 && event.images.length > 0) },
        {
            key: 'contact',
            state: doneIf(Boolean(event.public_contact_name && event.public_contact_email && event.public_contact_phone)),
        },
        { key: 'ticketTypes', state: doneIf(activeTypes.length > 0) },
        {
            key: 'salesWindows',
            state: doneIf(ticketTypes.every((type) => new Date(type.sales_end_at).getTime() <= endsAt)),
        },
        {
            key: 'capacity',
            state: event.seating_mode === 'ASSIGNED_SEATING' ? 'blocked' : doneIf((event.ga_capacity ?? 0) > 0),
        },
        { key: 'paidSales', state: doneIf(!hasPaidTypes || paidSales?.status === 'ACTIVE') },
        { key: 'notEnded', state: doneIf(endsAt > now) },
    ]
}
