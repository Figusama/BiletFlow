import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import Input from '../components/ui/Input'
import StatusBadge, { type BadgeIcon, type BadgeTone } from '../components/ui/StatusBadge'
import {
    eventOrdersKey,
    eventRefundsKey,
    ORDERS_PAGE_SIZE,
    useEventOrders,
    useManagedEvent,
    usePendingRefunds,
    type EventOrder,
    type ManagedEvent,
    type OrderStatus,
} from '../features/organizer/api'
import RefundOrderDialog from '../features/organizer/components/RefundOrderDialog'
import { formatDateTime } from '../features/organizer/changes'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'

const orderBadge: Record<OrderStatus, { tone: BadgeTone; icon: BadgeIcon }> = {
    CONFIRMED: { tone: 'success', icon: 'check-circle' },
    PENDING: { tone: 'warning', icon: 'clock' },
    CANCELLED: { tone: 'neutral', icon: 'ban' },
    EXPIRED: { tone: 'neutral', icon: 'clock' },
}

const filters: (OrderStatus | null)[] = [null, 'CONFIRMED', 'PENDING', 'CANCELLED', 'EXPIRED']

type RefundState = 'REQUESTED' | 'IN_PROGRESS' | 'REFUNDED' | 'FAILED'

const refundState = (order: EventOrder): RefundState | null => {
    if (order.refund_status === 'PENDING' || order.refund_status === 'PENDING_ADMIN') return 'REQUESTED'
    if (order.refund_status !== 'APPROVED') return null
    if (order.refund_execution_status === 'SUCCEEDED') return 'REFUNDED'
    if (order.refund_execution_status === 'FAILED_FINAL') return 'FAILED'
    return 'IN_PROGRESS'
}

const refundBadge: Record<RefundState, { tone: BadgeTone; icon: BadgeIcon }> = {
    REQUESTED: { tone: 'warning', icon: 'clock' },
    IN_PROGRESS: { tone: 'warning', icon: 'clock' },
    REFUNDED: { tone: 'danger', icon: 'x-circle' },
    FAILED: { tone: 'danger', icon: 'x-circle' },
}

const canRefund = (order: EventOrder) => {
    const state = refundState(order)
    return order.status === 'CONFIRMED' && order.total_minor > 0 && (state === null || state === 'FAILED')
}

const OrganizerOrdersPage = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event, isPending, isError } = useManagedEvent(eventId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !event) return <p className="text-muted">{t.organizerEvent.loadFailed}</p>

    return <Orders key={event.id} event={event} />
}

const Orders = ({ event }: { event: ManagedEvent }) => {
    const { t } = useLanguage()
    const texts = t.organizerOrders
    const queryClient = useQueryClient()
    const [searchText, setSearchText] = useState('')
    const [search, setSearch] = useState('')
    const [status, setStatus] = useState<OrderStatus | null>(null)
    const [limit, setLimit] = useState(ORDERS_PAGE_SIZE)
    const [refunding, setRefunding] = useState<EventOrder | null>(null)
    const { data: orders = [], isPending, isError, isFetching } = useEventOrders(event.id, search, status, limit)
    const { data: pendingRefunds = [] } = usePendingRefunds(event.id)

    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchText.trim())
            setLimit(ORDERS_PAGE_SIZE)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchText])

    const chooseStatus = (value: OrderStatus | null) => {
        setStatus(value)
        setLimit(ORDERS_PAGE_SIZE)
    }

    return (
        <div className="flex flex-col gap-6">
            <header>
                <p className="text-xs font-bold tracking-widest text-accent uppercase">{event.title}</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
            </header>

            {pendingRefunds.length > 0 && (
                <div role="status" className="flex items-start gap-3 rounded-2xl bg-badge-warning-bg p-4 text-badge-warning-fg">
                    <Icon name="clock" className="mt-0.5 size-5 shrink-0" />
                    <p className="text-sm font-semibold">
                        {texts.pendingRefunds(pendingRefunds.length)}{' '}
                        <Link to="../refunds" relative="path" className="underline focus-visible:outline-2 focus-visible:outline-accent">
                            {texts.pendingRefundsLink}
                        </Link>
                    </p>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-72">
                    <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                    <Input
                        type="search"
                        aria-label={texts.search}
                        placeholder={texts.search}
                        value={searchText}
                        className="pl-9"
                        onChange={(changeEvent) => setSearchText(changeEvent.target.value)}
                    />
                </div>
                {filters.map((value) => (
                    <button
                        key={value ?? 'ALL'}
                        type="button"
                        aria-pressed={status === value}
                        onClick={() => chooseStatus(value)}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                            status === value ? 'border-accent bg-accent-soft text-accent' : 'border-border text-foreground hover:border-border-strong'
                        }`}
                    >
                        {value ? texts.status[value] : texts.all}
                    </button>
                ))}
            </div>

            {isPending ? (
                <div className="h-40 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : orders.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty}</p>
            ) : (
                <>
                    <div className={`overflow-x-auto rounded-2xl border border-border bg-surface ${isFetching ? 'opacity-70' : ''}`}>
                        <table className="w-full min-w-[760px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                    <th className="px-5 py-3 font-semibold">{texts.columns.buyer}</th>
                                    <th className="px-5 py-3 font-semibold">{texts.columns.order}</th>
                                    <th className="px-5 py-3 font-semibold">{texts.columns.tickets}</th>
                                    <th className="px-5 py-3 font-semibold">{texts.columns.status}</th>
                                    <th className="px-5 py-3 text-right font-semibold">{texts.columns.paid}</th>
                                    <th className="px-5 py-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {orders.map((order) => {
                                    const badge = orderBadge[order.status]
                                    const refund = refundState(order)
                                    return (
                                        <tr key={order.id}>
                                            <td className="px-5 py-3">
                                                <p className="font-semibold text-foreground">{order.buyer_name ?? order.buyer_email}</p>
                                                {order.buyer_name && <p className="text-xs text-muted">{order.buyer_email}</p>}
                                            </td>
                                            <td className="px-5 py-3">
                                                <p className="font-mono text-foreground">{order.order_number}</p>
                                                <p className="text-xs text-muted">{formatDateTime(order.created_at, event.timezone, t)}</p>
                                            </td>
                                            <td className="px-5 py-3 text-foreground">{order.tickets}</td>
                                            <td className="px-5 py-3">
                                                <div className="flex flex-wrap gap-1.5">
                                                    <StatusBadge tone={badge.tone} icon={badge.icon}>
                                                        {texts.status[order.status]}
                                                    </StatusBadge>
                                                    {refund && (
                                                        <StatusBadge tone={refundBadge[refund].tone} icon={refundBadge[refund].icon}>
                                                            {texts.refundStates[refund]}
                                                        </StatusBadge>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-3 text-right whitespace-nowrap text-foreground">{formatKzt(order.total_minor)}</td>
                                            <td className="px-5 py-3 text-right">
                                                {canRefund(order) && !event.is_suspended && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setRefunding(order)}
                                                        className="text-sm font-medium text-error hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                                                    >
                                                        {texts.refundAction}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    {orders.length >= limit && (
                        <div className="flex justify-center">
                            <Button variant="secondary" shape="pill" disabled={isFetching} onClick={() => setLimit(limit + ORDERS_PAGE_SIZE)}>
                                {texts.showMore}
                            </Button>
                        </div>
                    )}
                </>
            )}

            {refunding && (
                <RefundOrderDialog
                    order={refunding}
                    onClose={(refunded) => {
                        setRefunding(null)
                        if (refunded) {
                            queryClient.invalidateQueries({ queryKey: eventOrdersKey(event.id) })
                            queryClient.invalidateQueries({ queryKey: eventRefundsKey(event.id) })
                        }
                    }}
                />
            )}
        </div>
    )
}

export default OrganizerOrdersPage
