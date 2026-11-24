import { Link } from 'react-router-dom'
import StatusBadge from '../../../components/ui/StatusBadge'
import { useLanguage } from '../../../shared/i18n/language'
import type { TicketType } from '../../tickets/api'
import { getEventStatus } from '../../tickets/status'
import type { EventDetails } from '../api'

interface EventBuyButtonProps {
    event: EventDetails
    ticketTypes: TicketType[]
}

const buttonClass = 'flex h-12 w-full items-center justify-center rounded-full px-8 text-sm font-semibold sm:w-auto'

const EventBuyButton = ({ event, ticketTypes }: EventBuyButtonProps) => {
    const { t } = useLanguage()
    const status = getEventStatus(event, ticketTypes, t)
    const canBuy =
        event.status === 'PUBLISHED' &&
        !event.is_suspended &&
        ticketTypes.some((ticketType) => ticketType.sale_state === 'ON_SALE')

    return (
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
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
            {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
        </div>
    )
}

export default EventBuyButton
