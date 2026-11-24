import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useEvents } from '../features/events/api'
import { useMyTickets } from '../features/tickets/api'
import TicketOrderCard from '../features/tickets/components/TicketOrderCard'
import { groupByOrder, isCancelled, type TicketOrder } from '../features/tickets/orders'
import { useLanguage } from '../shared/i18n/language'
import { toDayKey } from '../shared/lib/date'

type Tab = 'upcoming' | 'past'

const tabClass = (isActive: boolean) =>
    `inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
        isActive ? 'bg-night text-on-night' : 'text-foreground hover:bg-surface-sunk'
    }`

const MyTicketsPage = () => {
    const { t } = useLanguage()
    const [tab, setTab] = useState<Tab>('upcoming')
    const { data: tickets = [], isPending, isError, refetch } = useMyTickets()
    const { data: events = [] } = useEvents()

    const eventsById = new Map(events.map((event) => [event.id, event]))
    const today = toDayKey(new Date())
    const isPast = (order: TicketOrder) => toDayKey(new Date(order.startsAt), order.timeZone) < today

    const orders = groupByOrder(tickets)
    const tabs: Record<Tab, TicketOrder[]> = {
        upcoming: orders.filter((order) => !isPast(order)),
        past: orders.filter(isPast).reverse(),
    }
    const shown = tabs[tab]
    const active = shown.filter((order) => !isCancelled(order))
    const cancelled = shown.filter(isCancelled)

    const renderList = (list: TicketOrder[]) => (
        <ul className="flex flex-col gap-4">
            {list.map((order) => (
                <li key={order.orderId}>
                    <TicketOrderCard order={order} event={eventsById.get(order.eventId)} />
                </li>
            ))}
        </ul>
    )

    return (
        <div className="mx-auto max-w-[1224px] px-4 pt-8 pb-16 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{t.nav.myTickets}</h1>

                <div role="group" aria-label={t.nav.myTickets} className="flex gap-1 rounded-full border border-border bg-surface p-1">
                    {(['upcoming', 'past'] as const).map((key) => (
                        <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)} className={tabClass(tab === key)}>
                            {t.ticketsPage[key]} {tabs[key].length}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mt-8 flex flex-col gap-8">
                {isPending && (
                    <p role="status" className="py-10 text-center text-muted">
                        {t.ticketsPage.loading}
                    </p>
                )}

                {isError && (
                    <div role="alert" className="py-10 text-center">
                        <p className="text-muted">{t.ticketsPage.loadError}</p>
                        <button type="button" onClick={() => refetch()} className="mt-3 font-semibold text-accent hover:underline">
                            {t.discover.retry}
                        </button>
                    </div>
                )}

                {!isPending && !isError && shown.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-border py-12 text-center">
                        <p className="text-muted">{tab === 'upcoming' ? t.ticketsPage.empty : t.ticketsPage.emptyPast}</p>
                        <Link to="/" className="mt-3 inline-block font-semibold text-accent hover:underline">
                            {t.ticketsPage.browse}
                        </Link>
                    </div>
                )}

                {active.length > 0 && renderList(active)}

                {cancelled.length > 0 && (
                    <section aria-labelledby="cancelled-title">
                        <h2 id="cancelled-title" className="mb-4 text-xs font-bold tracking-widest text-muted uppercase">
                            {t.ticketsPage.cancelled}
                        </h2>
                        {renderList(cancelled)}
                    </section>
                )}
            </div>
        </div>
    )
}

export default MyTicketsPage
