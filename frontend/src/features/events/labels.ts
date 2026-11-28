import type { Dictionary } from '../../shared/i18n/dictionaries/en'
import { formatTime, getDateParts, toDayKey } from '../../shared/lib/date'
import { formatKzt } from '../../shared/lib/money'
import type { EventSummary } from './api'

export const getCategoryLabel = (event: EventSummary, t: Dictionary) => {
    const category = event.categories?.[0]
    if (!category) return null

    const labels: Record<string, string> = t.categories
    return labels[category.slug] ?? category.name
}

export const formatPriceFrom = (price: number | null | undefined, t: Dictionary) => {
    if (price === undefined || price === null) return null
    if (price === 0) return t.discover.free
    return t.discover.priceFrom(formatKzt(price))
}

export const getPriceLabel = (event: EventSummary, t: Dictionary) => formatPriceFrom(event.price_from, t)

export const formatEventDate = (event: EventSummary, t: Dictionary, withWeekday = false) => {
    const startsAt = new Date(event.starts_at)
    const { day, month, weekday } = getDateParts(startsAt, event.timezone)
    const date = `${day} ${t.dates.monthsGenitive[month]}, ${formatTime(startsAt, event.timezone)}`
    return withWeekday ? `${t.dates.weekdays[weekday]} ${date}` : date
}

export const formatEventTimeRange = (event: Pick<EventSummary, 'starts_at' | 'ends_at' | 'timezone'>, t: Dictionary) => {
    const startsAt = new Date(event.starts_at)
    const endsAt = new Date(event.ends_at)
    const start = getDateParts(startsAt, event.timezone)
    const startText = `${t.dates.weekdaysShort[start.weekday]} ${start.day} ${t.dates.monthsShort[start.month]}, ${formatTime(startsAt, event.timezone)}`

    if (toDayKey(startsAt, event.timezone) === toDayKey(endsAt, event.timezone)) {
        return `${startText} – ${formatTime(endsAt, event.timezone)}`
    }

    const end = getDateParts(endsAt, event.timezone)
    return `${startText} – ${end.day} ${t.dates.monthsShort[end.month]}, ${formatTime(endsAt, event.timezone)}`
}
