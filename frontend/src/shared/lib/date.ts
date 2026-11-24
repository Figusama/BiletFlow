export const APP_TIME_ZONE = 'Asia/Almaty'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export interface DateParts {
    year: number
    month: number
    day: number
    weekday: number
    hours: number
    minutes: number
}

const pad = (value: number) => String(value).padStart(2, '0')

export const getDateParts = (date: Date, timeZone = APP_TIME_ZONE): DateParts => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date)

    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''

    return {
        year: Number(value('year')),
        month: Number(value('month')) - 1,
        day: Number(value('day')),
        weekday: WEEKDAYS.indexOf(value('weekday')),
        hours: Number(value('hour')),
        minutes: Number(value('minute')),
    }
}

export const toDayKey = (date: Date, timeZone = APP_TIME_ZONE) => {
    const { year, month, day } = getDateParts(date, timeZone)
    return `${year}-${pad(month + 1)}-${pad(day)}`
}

export const formatTime = (date: Date, timeZone = APP_TIME_ZONE) => {
    const { hours, minutes } = getDateParts(date, timeZone)
    return `${pad(hours)}:${pad(minutes)}`
}

export const getNextDays = (count: number) => {
    const now = Date.now()
    return Array.from({ length: count }, (_, index) => new Date(now + index * DAY_MS))
}

export const toDateTimeInput = (iso: string | null, timeZone: string) => {
    if (!iso) return ''
    const { year, month, day, hours, minutes } = getDateParts(new Date(iso), timeZone)
    return `${year}-${pad(month + 1)}-${pad(day)}T${pad(hours)}:${pad(minutes)}`
}

export const fromDateTimeInput = (value: string, timeZone: string) => {
    if (!value) return null
    const asUtc = new Date(`${value}:00Z`)
    const shown = toDateTimeInput(asUtc.toISOString(), timeZone)
    const offset = new Date(`${shown}:00Z`).getTime() - asUtc.getTime()
    return new Date(asUtc.getTime() - offset).toISOString()
}
