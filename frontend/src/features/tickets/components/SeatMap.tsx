import { useEffect, useRef } from 'react'
import { useLanguage } from '../../../shared/i18n/language'
import { formatKzt } from '../../../shared/lib/money'
import type { Seat, TicketType } from '../api'
import type { SeatSection } from '../seats'

interface SeatMapProps {
    sections: SeatSection[]
    ticketTypes: TicketType[]
    colorOf: (ticketTypeId: string | null) => string
    selectedIds: string[]
    onToggle: (seat: Seat) => void
}

const seatClass = 'size-5 shrink-0 rounded transition-transform md:size-6 md:rounded-md'
const selectedClass = 'bg-night ring-2 ring-accent ring-offset-1 ring-offset-surface'
const takenClass = 'bg-border-strong opacity-50'
const unavailableClass = 'border border-dashed border-border-strong'

const LegendItem = ({ swatch, label }: { swatch: string; label: string }) => (
    <li className="flex items-center gap-2">
        <span aria-hidden="true" className={`size-3.5 rounded ${swatch}`} />
        {label}
    </li>
)

const SeatMap = ({ sections, ticketTypes, colorOf, selectedIds, onToggle }: SeatMapProps) => {
    const { t } = useLanguage()
    const typeById = new Map(ticketTypes.map((type) => [type.id, type]))
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const box = scrollRef.current
        if (box) box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2
    }, [sections.length])

    const getSeatClass = (seat: Seat, isSelected: boolean) => {
        if (isSelected) return selectedClass
        if (seat.state === 'TAKEN') return takenClass
        if (seat.state === 'UNAVAILABLE') return unavailableClass
        return `${colorOf(seat.ticket_type_id)} hover:scale-110`
    }

    return (
        <div className="rounded-2xl border border-border bg-surface p-5">
            <div ref={scrollRef} className="overflow-x-auto pb-2">
                <div className="mx-auto w-max">
                    <p className="mx-auto mb-6 w-2/3 rounded-full bg-night py-1.5 text-center text-xs font-bold tracking-widest text-on-night uppercase">
                        {t.seats.stage}
                    </p>

                    <div className="flex items-start gap-4 md:gap-6">
                        {sections.map((section) => (
                            <div key={section.name}>
                                <p className="mb-2 text-center text-xs font-bold tracking-widest text-muted uppercase">{section.name}</p>
                                <div className="flex flex-col gap-1 md:gap-1.5">
                                    {section.rows.map((row) => (
                                        <div key={row.label} className="flex items-center gap-1 md:gap-1.5">
                                            <span className="w-4 shrink-0 text-xs text-muted">{row.label}</span>
                                            {row.seats.map((seat) => {
                                                const isSelected = selectedIds.includes(seat.id)
                                                const type = seat.ticket_type_id ? typeById.get(seat.ticket_type_id) : undefined
                                                const label = t.seats.seatLabel(section.name, row.label, seat.seat_number)
                                                const details = type ? `${label}, ${type.name}, ${formatKzt(type.price_minor)}` : label

                                                return (
                                                    <button
                                                        key={seat.id}
                                                        type="button"
                                                        title={details}
                                                        aria-label={details}
                                                        aria-pressed={isSelected}
                                                        disabled={seat.state !== 'AVAILABLE' && !isSelected}
                                                        onClick={() => onToggle(seat)}
                                                        className={`${seatClass} ${getSeatClass(seat, isSelected)} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed`}
                                                    />
                                                )
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4 text-xs text-muted">
                {ticketTypes.map((type) => (
                    <LegendItem key={type.id} swatch={colorOf(type.id)} label={`${type.name} ${formatKzt(type.price_minor)}`} />
                ))}
                <LegendItem swatch={selectedClass} label={t.seats.yourSeats} />
                <LegendItem swatch={takenClass} label={t.seats.taken} />
                <LegendItem swatch={unavailableClass} label={t.seats.unavailable} />
            </ul>
        </div>
    )
}

export default SeatMap
