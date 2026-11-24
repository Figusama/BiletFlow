import type { BadgeTone } from '../../components/ui/StatusBadge'
import type { Dictionary } from '../../shared/i18n/dictionaries/en'
import type { EventDetails } from '../events/api'
import type { SaleState, TicketType } from './api'

export const getMinPrice = (ticketTypes: TicketType[]) => {
    const onSale = ticketTypes.filter((ticketType) => ticketType.sale_state === 'ON_SALE')
    const source = onSale.length > 0 ? onSale : ticketTypes
    if (source.length === 0) return null
    return Math.min(...source.map((ticketType) => ticketType.price_minor))
}

export const getSaleState = (ticketTypes: TicketType[]): SaleState | null => {
    if (ticketTypes.length === 0) return null
    if (ticketTypes.some((ticketType) => ticketType.sale_state === 'ON_SALE')) return 'ON_SALE'
    return ticketTypes[0].sale_state
}

const saleStateTone: Record<SaleState, BadgeTone> = {
    ON_SALE: 'success',
    SOLD_OUT: 'neutral',
    ENDED: 'neutral',
    NOT_STARTED: 'warning',
    PAUSED: 'warning',
    DISABLED: 'neutral',
    NOT_ON_SALE: 'neutral',
}

export const getEventStatus = (event: EventDetails, ticketTypes: TicketType[], t: Dictionary) => {
    if (event.status === 'CANCELLED') return { label: t.eventPage.statusCancelled, tone: 'danger' as const }
    if (event.is_suspended) return { label: t.eventPage.statusSuspended, tone: 'warning' as const }

    const state = getSaleState(ticketTypes)
    if (!state) return null
    return { label: t.tickets.states[state], tone: saleStateTone[state] }
}
