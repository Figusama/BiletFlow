import { toDayKey } from '../../shared/lib/date'
import type { EventSummary } from './api'

export type SortOrder = 'date' | 'price'

export interface EventFilters {
    day: string | null
    categories: string[]
    minPrice: string
    maxPrice: string
    freeOnly: boolean
}

export const EMPTY_FILTERS: EventFilters = {
    day: null,
    categories: [],
    minPrice: '',
    maxPrice: '',
    freeOnly: false,
}

export const getEventDayKey = (event: EventSummary) => toDayKey(new Date(event.starts_at), event.timezone)

const matchesSearch = (event: EventSummary, search: string) => {
    const text = `${event.title} ${event.venue_name ?? ''} ${event.venue_city ?? ''}`.toLowerCase()
    return text.includes(search.trim().toLowerCase())
}

const matchesPrice = (event: EventSummary, filters: EventFilters) => {
    const hasPriceFilter = filters.freeOnly || filters.minPrice !== '' || filters.maxPrice !== ''
    const price = event.price_from

    if (price === undefined || price === null) return !hasPriceFilter
    if (filters.freeOnly && price > 0) return false
    if (filters.minPrice !== '' && price < Number(filters.minPrice) * 100) return false
    if (filters.maxPrice !== '' && price > Number(filters.maxPrice) * 100) return false
    return true
}

export const getCities = (events: EventSummary[]) =>
    [...new Set(events.map((event) => event.venue_city).filter((city) => city !== null))].sort()

export const getCategories = (events: EventSummary[]) => {
    const bySlug = new Map(events.flatMap((event) => event.categories ?? []).map((category) => [category.slug, category]))
    return [...bySlug.values()]
}

export const filterEvents = (events: EventSummary[], filters: EventFilters, search: string, city: string | null) =>
    events.filter((event) => {
        if (city && event.venue_city !== city) return false
        if (filters.day && getEventDayKey(event) !== filters.day) return false
        if (filters.categories.length > 0 && !event.categories?.some((category) => filters.categories.includes(category.slug))) return false
        if (search && !matchesSearch(event, search)) return false
        return matchesPrice(event, filters)
    })

export const sortEvents = (events: EventSummary[], order: SortOrder) => {
    if (order === 'date') {
        return [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    }

    const priceOf = (event: EventSummary) => event.price_from ?? Number.POSITIVE_INFINITY
    return [...events].sort((a, b) => priceOf(a) - priceOf(b))
}
