import { useQueries } from '@tanstack/react-query'
import { ticketTypesQuery } from '../tickets/api'
import { getMinPrice } from '../tickets/status'
import { useEvents } from './api'

export const usePricedEvents = () => {
    const { data: events = [], isPending, isError, refetch } = useEvents()

    const ticketTypes = useQueries({
        queries: events.map((event) => ({
            ...ticketTypesQuery(event.id),
            enabled: event.price_from === undefined || event.price_from === null,
        })),
    })

    const pricedEvents = events.map((event, index) => {
        const types = ticketTypes[index]?.data
        if (!types || (event.price_from !== undefined && event.price_from !== null)) return event
        return { ...event, price_from: getMinPrice(types) }
    })

    return { data: pricedEvents, isPending, isError, refetch }
}
