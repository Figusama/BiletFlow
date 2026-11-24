import type { Seat, TicketType, TicketTypeColor } from './api'

export interface SeatRow {
    label: string
    seats: Seat[]
}

export interface SeatSection {
    name: string
    rows: SeatRow[]
}

const SECTION_ORDER = ['Left', 'Center', 'Right']

const sectionRank = (name: string) => {
    const index = SECTION_ORDER.indexOf(name)
    return index === -1 ? SECTION_ORDER.length : index
}

export const groupSeats = (seats: Seat[]): SeatSection[] => {
    const sections = new Map<string, Map<string, Seat[]>>()
    for (const seat of seats) {
        const rows = sections.get(seat.section) ?? new Map<string, Seat[]>()
        rows.set(seat.row, [...(rows.get(seat.row) ?? []), seat])
        sections.set(seat.section, rows)
    }

    return [...sections.entries()]
        .sort(([a], [b]) => sectionRank(a) - sectionRank(b) || a.localeCompare(b))
        .map(([name, rows]) => ({
            name,
            rows: [...rows.entries()]
                .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
                .map(([label, rowSeats]) => ({
                    label,
                    seats: [...rowSeats].sort((a, b) => a.seat_number.localeCompare(b.seat_number, undefined, { numeric: true })),
                })),
        }))
}

const COLOR_CLASSES: Record<TicketTypeColor, string> = {
    violet: 'bg-violet-600 dark:bg-violet-400',
    amber: 'bg-amber-600 dark:bg-amber-400',
    sky: 'bg-sky-600 dark:bg-sky-400',
    orange: 'bg-orange-600 dark:bg-orange-400',
    lime: 'bg-lime-600 dark:bg-lime-400',
    pink: 'bg-pink-600 dark:bg-pink-400',
    emerald: 'bg-emerald-600 dark:bg-emerald-400',
    rose: 'bg-rose-600 dark:bg-rose-400',
}

const DEFAULT_ORDER = Object.keys(COLOR_CLASSES) as TicketTypeColor[]

export const getTypeColor = (ticketTypes: TicketType[], ticketTypeId: string | null) => {
    const index = Math.max(
        ticketTypes.findIndex((type) => type.id === ticketTypeId),
        0,
    )
    const color = ticketTypes[index]?.color ?? DEFAULT_ORDER[index % DEFAULT_ORDER.length]
    return COLOR_CLASSES[color]
}
