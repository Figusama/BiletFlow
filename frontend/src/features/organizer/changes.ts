import type { Dictionary } from '../../shared/i18n/dictionaries/en'
import { formatTime, getDateParts } from '../../shared/lib/date'
import { formatKzt } from '../../shared/lib/money'
import type { Venue } from '../applications/api'
import type { ChangeField, ManagedEvent, ManagedTicketType } from './api'

export const EVENT_FIELDS: ChangeField[] = [
    'TITLE',
    'STARTS_AT',
    'ENDS_AT',
    'VENUE',
    'GA_CAPACITY',
    'RESPONSIBLE_NAME',
    'RESPONSIBLE_EMAIL',
    'RESPONSIBLE_PHONE',
    'REFUND_POLICY',
]

export const TICKET_FIELDS: ChangeField[] = ['TICKET_TYPE_PRICE', 'TICKET_TYPE_QUANTITY', 'TICKET_TYPE_ACTIVE', 'TICKET_TYPE_SALES_WINDOW']

export const REFUND_HOURS = [24, 72, 168]

interface FormatContext {
    t: Dictionary
    event: ManagedEvent
    venues: Venue[]
}

export const formatDateTime = (iso: string, timeZone: string, t: Dictionary) => {
    const date = new Date(iso)
    const { day, month, year } = getDateParts(date, timeZone)
    return `${day} ${t.dates.monthsShort[month]} ${year}, ${formatTime(date, timeZone)}`
}

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {})

export const formatChangeValue = (field: ChangeField, value: unknown, { t, event, venues }: FormatContext): string => {
    const texts = t.organizerChanges
    if (value === null || value === undefined || value === '') {
        return field === 'TICKET_TYPE_QUANTITY' ? texts.noLimit : texts.notSet
    }
    switch (field) {
        case 'STARTS_AT':
        case 'ENDS_AT':
            return formatDateTime(String(value), event.timezone, t)
        case 'VENUE': {
            const venue = venues.find((item) => item.id === value)
            return venue ? `${venue.name}, ${venue.city}` : String(value)
        }
        case 'GA_CAPACITY':
            return t.organizerEvent.capacityValue(Number(value))
        case 'REFUND_POLICY': {
            const hours = asRecord(value).self_service_refund_until_hours_before_start
            return typeof hours === 'number' ? t.organizerEvent.refundUntil(hours) : t.organizerEvent.refundNone
        }
        case 'TICKET_TYPE_PRICE':
            return formatKzt(Number(value))
        case 'TICKET_TYPE_QUANTITY':
            return t.organizerTickets.quantityValue(Number(value))
        case 'TICKET_TYPE_ACTIVE':
            return value ? texts.visible : texts.hidden
        case 'TICKET_TYPE_SALES_WINDOW': {
            const window = asRecord(value)
            const start = typeof window.sales_start_at === 'string' ? formatDateTime(window.sales_start_at, event.timezone, t) : '?'
            const end = typeof window.sales_end_at === 'string' ? formatDateTime(window.sales_end_at, event.timezone, t) : '?'
            return `${start} – ${end}`
        }
        default:
            return typeof value === 'object' ? JSON.stringify(value) : String(value)
    }
}

export const ticketTypeName = (ticketTypes: ManagedTicketType[], id: string | null) =>
    ticketTypes.find((type) => type.id === id)?.name ?? ''
