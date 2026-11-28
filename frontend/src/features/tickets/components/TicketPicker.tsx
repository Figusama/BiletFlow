import Icon from '../../../components/ui/Icon'
import type { Dictionary } from '../../../shared/i18n/dictionaries/en'
import { useLanguage } from '../../../shared/i18n/language'
import { formatTime, getDateParts } from '../../../shared/lib/date'
import { formatKzt } from '../../../shared/lib/money'
import type { TicketType } from '../api'

interface TicketPickerProps {
    ticketTypes: TicketType[]
    quantities: Record<string, number>
    onChange: (ticketTypeId: string, quantity: number) => void
    timeZone: string
}

const stepButtonClass =
    'grid size-8 place-items-center rounded-full text-lg text-foreground hover:bg-accent-soft disabled:opacity-40 disabled:hover:bg-transparent'

const getMaxQuantity = (ticketType: TicketType) =>
    Math.min(ticketType.max_per_order, ticketType.available ?? ticketType.max_per_order)

const formatSalesEnd = (ticketType: TicketType, timeZone: string, t: Dictionary) => {
    const endsAt = new Date(ticketType.sales_end_at)
    const { day, month } = getDateParts(endsAt, timeZone)
    return t.tickets.salesEnd(`${day} ${t.dates.monthsGenitive[month]}, ${formatTime(endsAt, timeZone)}`)
}

const TicketPicker = ({ ticketTypes, quantities, onChange, timeZone }: TicketPickerProps) => {
    const { t } = useLanguage()

    return (
        <ul className="flex flex-col gap-4">
            {ticketTypes.map((ticketType) => {
                const isAvailable = ticketType.sale_state === 'ON_SALE'
                const quantity = quantities[ticketType.id] ?? 0
                const max = getMaxQuantity(ticketType)
                const left =
                    ticketType.available !== null && ticketType.quantity_total !== null
                        ? t.tickets.left(ticketType.available, ticketType.quantity_total)
                        : null

                return (
                    <li
                        key={ticketType.id}
                        className={`flex flex-col gap-4 rounded-2xl border bg-surface p-4 sm:flex-row sm:items-center ${
                            quantity > 0 ? 'border-accent ring-1 ring-accent' : 'border-border'
                        } ${isAvailable ? '' : 'opacity-60'}`}
                    >
                        <div className="min-w-0 flex-1">
                            <h3 className="text-base font-bold text-foreground">{ticketType.name}</h3>
                            {ticketType.description && <p className="mt-1 text-sm text-muted">{ticketType.description}</p>}
                            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                                {isAvailable ? (
                                    [left, t.tickets.maxPerOrder(ticketType.max_per_order), formatSalesEnd(ticketType, timeZone, t)]
                                        .filter(Boolean)
                                        .map((item) => <span key={item}>{item}</span>)
                                ) : (
                                    <span>{t.tickets.states[ticketType.sale_state]}</span>
                                )}
                            </p>
                        </div>

                        <div className="flex items-center justify-between gap-6 sm:justify-end">
                            <span className="text-lg font-bold whitespace-nowrap text-foreground">
                                {ticketType.price_minor === 0 ? t.discover.free : formatKzt(ticketType.price_minor)}
                            </span>

                            {isAvailable && (
                                <div className="flex items-center rounded-full border border-border-strong p-1">
                                    <button
                                        type="button"
                                        aria-label={`${t.tickets.decrease}: ${ticketType.name}`}
                                        disabled={quantity === 0}
                                        onClick={() => onChange(ticketType.id, quantity - 1)}
                                        className={stepButtonClass}
                                    >
                                        <Icon name="minus" className="size-3.5" />
                                    </button>
                                    <span aria-live="polite" className="w-7 text-center font-bold text-foreground">
                                        {quantity}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label={`${t.tickets.increase}: ${ticketType.name}`}
                                        disabled={quantity >= max}
                                        onClick={() => onChange(ticketType.id, quantity + 1)}
                                        className={stepButtonClass}
                                    >
                                        <Icon name="plus" className="size-3.5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </li>
                )
            })}
        </ul>
    )
}

export default TicketPicker
