import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import StatusBadge, { type BadgeTone } from '../components/ui/StatusBadge'
import {
    eventAttendeesKey,
    eventOrdersKey,
    eventRefundsKey,
    useEventOrderDetail,
    useManagedEvent,
    type EventOrder,
    type EventOrderDetail,
    type ManagedEvent,
    type TicketStatus,
} from '../features/organizer/api'
import { formatDateTime } from '../features/organizer/changes'
import RefundOrderDialog from '../features/organizer/components/RefundOrderDialog'
import { canRefund, refundState } from '../features/organizer/refunds'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'

const ticketTone: Record<TicketStatus, BadgeTone> = { VALID: 'neutral', CHECKED_IN: 'success', CANCELLED: 'neutral', REFUNDED: 'danger' }

const toEventOrder = (order: EventOrderDetail): EventOrder => ({
    id: order.id,
    order_number: order.order_number,
    status: order.status,
    buyer_name: order.buyer_name,
    buyer_email: order.buyer_email,
    tickets: order.tickets.length,
    subtotal_minor: order.subtotal_minor,
    discount_minor: order.discount_minor,
    total_minor: order.total_minor,
    refund_status: order.refund?.status ?? null,
    refund_execution_status: order.refund?.execution_status ?? null,
    created_at: order.created_at,
    confirmed_at: order.confirmed_at,
})

const OrganizerOrderDetailPage = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event, isPending, isError } = useManagedEvent(eventId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !event) return <p className="text-muted">{t.organizerEvent.loadFailed}</p>

    return <OrderDetail event={event} />
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="grid gap-1 py-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
        <dt className="text-sm text-muted">{label}</dt>
        <dd className="text-sm text-foreground">{children}</dd>
    </div>
)

const OrderDetail = ({ event }: { event: ManagedEvent }) => {
    const { t } = useLanguage()
    const texts = t.organizerOrders.detail
    const { orderId = '' } = useParams()
    const queryClient = useQueryClient()
    const { data: order, isPending, isError } = useEventOrderDetail(event.id, orderId)
    const [refunding, setRefunding] = useState(false)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !order) return <p className="text-muted">{texts.loadFailed}</p>

    const asOrder = toEventOrder(order)
    const refund = refundState(asOrder)
    const date = (iso: string) => formatDateTime(iso, event.timezone, t)

    return (
        <div className="flex max-w-3xl flex-col gap-6">
            <Link
                to=".."
                relative="path"
                className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
                <Icon name="chevron-left" className="size-4" />
                {t.organizerOrders.title}
            </Link>

            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{event.title}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                        {order.buyer_name ?? order.buyer_email} <span className="font-mono text-base font-normal text-muted">{order.order_number}</span>
                    </h1>
                    <p className="mt-1 text-sm text-muted">{texts.created(date(order.created_at))}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    <StatusBadge tone={order.status === 'CONFIRMED' ? 'success' : order.status === 'PENDING' ? 'warning' : 'neutral'}>
                        {t.organizerOrders.status[order.status]}
                    </StatusBadge>
                    {refund && (
                        <StatusBadge tone={refund === 'REQUESTED' || refund === 'IN_PROGRESS' ? 'warning' : 'danger'}>
                            {t.organizerOrders.refundStates[refund]}
                        </StatusBadge>
                    )}
                </div>
            </header>

            <section className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-lg font-bold text-foreground">{texts.order}</h2>
                <dl className="mt-2 divide-y divide-border">
                    <Row label={texts.buyer}>
                        {order.buyer_name && <p className="font-semibold">{order.buyer_name}</p>}
                        <p className={order.buyer_name ? 'text-muted' : ''}>{order.buyer_email}</p>
                    </Row>
                    {order.confirmed_at && <Row label={texts.confirmed}>{date(order.confirmed_at)}</Row>}
                    <Row label={texts.items}>
                        {order.items.map((item) => (
                            <p key={item.id}>
                                {item.quantity} x {item.ticket_type_name}
                                {item.seat_label && `, ${item.seat_label}`}
                                <span className="text-muted">{` ${formatKzt(item.unit_price_minor)}`}</span>
                            </p>
                        ))}
                    </Row>
                    <Row label={texts.subtotal}>{formatKzt(order.subtotal_minor)}</Row>
                    {order.discount_minor > 0 && (
                        <Row label={order.promo_code ? texts.discountWithCode(order.promo_code) : texts.discount}>{`−${formatKzt(order.discount_minor)}`}</Row>
                    )}
                    <Row label={texts.total}>
                        <span className="font-semibold">{formatKzt(order.total_minor)}</span>
                    </Row>
                    <Row label={texts.payment}>
                        {order.total_minor === 0 ? (
                            <span className="text-muted">{texts.freeOrder}</span>
                        ) : order.payment ? (
                            <>
                                {t.organizerOrders.attendees.paymentStatus[order.payment.status]}
                                {order.payment.attempt_number > 1 && <span className="text-muted">{`, ${texts.attempts(order.payment.attempt_number)}`}</span>}
                            </>
                        ) : (
                            <span className="text-muted">{texts.noPayment}</span>
                        )}
                    </Row>
                </dl>
            </section>

            {order.tickets.length > 0 && (
                <section className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <h2 className="px-5 pt-5 text-lg font-bold text-foreground">{texts.tickets}</h2>
                    <table className="mt-3 w-full min-w-[560px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.columns.ticket}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.attendee}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.seat}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.status}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {order.tickets.map((ticket) => (
                                <tr key={ticket.ticket_id}>
                                    <td className="px-5 py-3">
                                        <p className="font-mono text-foreground">{ticket.ticket_public_id}</p>
                                        <p className="text-xs text-muted">{ticket.ticket_type_name}</p>
                                    </td>
                                    <td className="px-5 py-3 text-foreground">{ticket.attendee_name}</td>
                                    <td className="px-5 py-3 text-foreground">{ticket.seat_label ?? '—'}</td>
                                    <td className="px-5 py-3">
                                        <StatusBadge tone={ticketTone[ticket.status]}>{t.organizerOrders.attendees.ticketStatus[ticket.status]}</StatusBadge>
                                        {ticket.checked_in_at && <p className="mt-1 text-xs text-muted">{date(ticket.checked_in_at)}</p>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            <section className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-lg font-bold text-foreground">{texts.refundTitle}</h2>
                <p className="mt-2 text-sm text-muted">{order.refund_deadline ? texts.deadline(date(order.refund_deadline)) : texts.noVoluntary}</p>
                {order.refund && order.refund.status === 'PENDING' && (
                    <Link
                        to={`/organizer/events/${event.id}/refunds/${order.refund.id}`}
                        className="mt-3 inline-block text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                        {texts.openRequest}
                    </Link>
                )}
                {canRefund(asOrder) && !event.is_suspended && (
                    <button
                        type="button"
                        onClick={() => setRefunding(true)}
                        className="mt-3 block text-sm font-medium text-error hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                        {t.organizerOrders.refundAction}
                    </button>
                )}
            </section>

            {refunding && (
                <RefundOrderDialog
                    order={asOrder}
                    onClose={(refunded) => {
                        setRefunding(false)
                        if (refunded) {
                            queryClient.invalidateQueries({ queryKey: eventOrdersKey(event.id) })
                            queryClient.invalidateQueries({ queryKey: eventRefundsKey(event.id) })
                            queryClient.invalidateQueries({ queryKey: eventAttendeesKey(event.id) })
                        }
                    }}
                />
            )}
        </div>
    )
}

export default OrganizerOrderDetailPage
