import { Link } from 'react-router-dom'
import DateStub from '../../events/components/DateStub'
import EventImage from '../../events/components/EventImage'
import { useLanguage } from '../../../shared/i18n/language'
import { formatTime } from '../../../shared/lib/date'
import { getCoverUrl, type EventSummary } from '../../events/api'
import { getCategoryLabel } from '../../events/labels'
import { isCancelled, type TicketOrder } from '../orders'
import TicketStatusBadge from './TicketStatusBadge'

interface TicketOrderCardProps {
    order: TicketOrder
    event?: EventSummary
}

const TicketOrderCard = ({ order, event }: TicketOrderCardProps) => {
    const { t } = useLanguage()
    const startsAt = new Date(order.startsAt)
    const category = event ? getCategoryLabel(event, t) : null
    const types = [...new Set(order.tickets.map((ticket) => ticket.ticket_type_name))]

    return (
        <article className="flex min-h-[136px] items-stretch rounded-2xl border border-border bg-surface">
            <DateStub date={startsAt} timeZone={order.timeZone} />

            <EventImage src={event && getCoverUrl(event)} className="my-4 ml-5 hidden h-26 w-44 shrink-0 rounded-xl sm:block" />

            <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 px-5 py-5 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                    <p className="flex flex-wrap gap-x-3 text-xs font-bold tracking-widest text-accent uppercase">
                        {category && <span>{category}</span>}
                        <span>{t.ticketsPage.ticketsCount(order.tickets.length)}</span>
                        <span>{types.join(', ')}</span>
                    </p>
                    <Link to={`/events/${order.eventId}`} className="mt-1 block text-base font-bold text-foreground hover:text-accent sm:text-lg">
                        {order.eventTitle}
                    </Link>
                    <p className="mt-1 text-sm text-muted">
                        {formatTime(startsAt, order.timeZone)}
                        {order.venueName && ` / ${order.venueName}`}
                    </p>
                </div>

                <div className="flex shrink-0 items-center gap-3 md:flex-col md:items-end">
                    <TicketStatusBadge status={order.status} />
                    {!isCancelled(order) && (
                        <Link
                            to={`/orders/${order.orderId}`}
                            className="inline-flex h-9 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            {t.ticketsPage.showQr}
                        </Link>
                    )}
                </div>
            </div>
        </article>
    )
}

export default TicketOrderCard
