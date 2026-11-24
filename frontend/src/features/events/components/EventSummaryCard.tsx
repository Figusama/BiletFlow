import { Link } from 'react-router-dom'
import StatusBadge from '../../../components/ui/StatusBadge'
import { useLanguage } from '../../../shared/i18n/language'
import type { TicketType } from '../../tickets/api'
import { getEventStatus } from '../../tickets/status'
import type { EventDetails } from '../api'

interface EventSummaryCardProps {
    event: EventDetails
    ticketTypes: TicketType[]
    priceLabel: string | null
}

const buttonClass = 'mt-5 flex h-11 w-full items-center justify-center rounded-full px-6 text-sm font-semibold'

const EventSummaryCard = ({ event, ticketTypes, priceLabel }: EventSummaryCardProps) => {
    const { t } = useLanguage()
    const status = getEventStatus(event, ticketTypes, t)
    const canBuy =
        event.status === 'PUBLISHED' &&
        !event.is_suspended &&
        ticketTypes.some((ticketType) => ticketType.sale_state === 'ON_SALE')

    return (
        <section aria-label={t.eventPage.buyTickets} className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-foreground">{t.tickets.title}</h2>
                {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
            </div>
            <p className="mt-3 text-2xl font-bold text-foreground">{priceLabel ?? '—'}</p>

            {canBuy ? (
                <Link
                    to={`/events/${event.slug}/tickets`}
                    className={`${buttonClass} bg-accent text-accent-foreground hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
                >
                    {t.eventPage.buyTickets}
                </Link>
            ) : (
                <span aria-disabled="true" className={`${buttonClass} bg-surface-sunk text-muted`}>
                    {t.eventPage.buyTickets}
                </span>
            )}
        </section>
    )
}

export default EventSummaryCard
