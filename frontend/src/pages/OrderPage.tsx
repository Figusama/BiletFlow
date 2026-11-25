import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { useEvent } from '../features/events/api'
import CalendarMenu from '../features/events/components/CalendarMenu'
import { startPayment, useOrder, type OrderStatus } from '../features/orders/api'
import CheckoutSteps from '../features/orders/components/CheckoutSteps'
import { useMyTickets } from '../features/tickets/api'
import TicketCard from '../features/tickets/components/TicketCard'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'
import Icon from '../components/ui/Icon'

const statusClass: Record<OrderStatus, string> = {
    CONFIRMED: 'bg-badge-success-bg text-badge-success-fg',
    PENDING: 'bg-badge-warning-bg text-badge-warning-fg',
    CANCELLED: 'bg-badge-neutral-bg text-badge-neutral-fg',
    EXPIRED: 'bg-badge-neutral-bg text-badge-neutral-fg',
}

const OrderPage = () => {
    const { t } = useLanguage()
    const { orderId = '' } = useParams()
    const { data: order, isPending } = useOrder(orderId)
    const isConfirmed = order?.status === 'CONFIRMED'
    const { data: event } = useEvent(order?.event_id ?? '')
    const { data: tickets = [] } = useMyTickets(isConfirmed)
    const orderTickets = tickets.filter((ticket) => ticket.order_id === orderId)
    const [isPaying, setIsPaying] = useState(false)
    const [payError, setPayError] = useState('')

    if (isPending) {
        return <div className="mx-auto h-96 max-w-[1224px] animate-pulse px-4 pt-8 sm:px-6" />
    }

    if (!order) {
        return (
            <div className="mx-auto max-w-md px-4 py-16 text-center">
                <h1 className="text-2xl font-bold text-foreground">{t.order.notFound}</h1>
                <Link to="/" className="mt-6 inline-block font-semibold text-accent hover:underline">
                    {t.common.backToEvents}
                </Link>
            </div>
        )
    }

    const statusText: Record<OrderStatus, string> = {
        CONFIRMED: t.order.confirmed,
        PENDING: t.order.pending,
        CANCELLED: t.order.cancelled,
        EXPIRED: t.order.expired,
    }
    const formatPrice = (minor: number) => (minor === 0 ? t.discover.free : formatKzt(minor))

    const handlePay = async () => {
        setIsPaying(true)
        setPayError('')
        try {
            const payment = await startPayment(order.id)
            if (payment.payment_url) {
                window.location.assign(payment.payment_url)
                return
            }
        } catch {
            setPayError(t.checkout.paymentFailed)
        }
        setIsPaying(false)
    }

    return (
        <div className="mx-auto max-w-[1224px] px-4 pt-8 pb-16 sm:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">{t.order.title(order.order_number)}</h1>
                    <p className="mt-2 font-semibold text-foreground">{order.event_title}</p>
                </div>
                <CheckoutSteps current={order.status === 'CONFIRMED' ? 3 : 2} />
            </div>

            <div className="mt-8 max-w-2xl">
                <p
                    role="status"
                    className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${statusClass[order.status]}`}
                >
                    {order.status === 'CONFIRMED' && <Icon name="check-circle" className="mt-0.5 size-4 shrink-0" />}
                    {statusText[order.status]}
                </p>

                <ul className="mt-6 flex flex-col gap-2 text-sm">
                    {order.items.map((item) => (
                        <li key={item.id} className="flex justify-between gap-3 text-foreground">
                            <span>
                                {item.seat_label ? `${item.ticket_type_name}, ${item.seat_label}` : item.ticket_type_name} × {item.quantity}
                            </span>
                            <span className="font-semibold whitespace-nowrap">{formatPrice(item.line_subtotal_minor)}</span>
                        </li>
                    ))}
                </ul>

                {order.discount_minor > 0 && (
                    <p className="mt-3 flex justify-between text-sm">
                        <span className="text-muted">{t.checkout.discount}</span>
                        <span className="text-badge-success-fg">−{formatKzt(order.discount_minor)}</span>
                    </p>
                )}

                <p className="mt-4 flex items-baseline justify-between gap-3 border-t border-border pt-4">
                    <span className="text-sm text-muted">{t.tickets.total}</span>
                    <span className="text-2xl font-bold text-foreground">{formatPrice(order.total_minor)}</span>
                </p>

                {payError && (
                    <p role="alert" className="mt-4 text-sm font-medium text-error">
                        {payError}
                    </p>
                )}

                <div className="mt-6 flex flex-wrap items-center gap-4">
                    {order.status === 'PENDING' && order.requires_payment && (
                        <Button type="button" shape="pill" disabled={isPaying} onClick={handlePay} className="min-h-11 px-8">
                            {isPaying ? t.checkout.processing : t.order.payAgain}
                        </Button>
                    )}
                    {order.status === 'CONFIRMED' && (
                        <Link
                            to="/tickets"
                            className="inline-flex min-h-11 items-center rounded-full bg-accent px-8 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
                        >
                            {t.order.myTickets}
                        </Link>
                    )}
                    {isConfirmed && event && <CalendarMenu event={event} />}
                    <Link to={`/events/${order.event_id}`} className="text-sm font-semibold text-accent hover:underline">
                        {t.order.backToEvent}
                    </Link>
                    <Link to={`/support/new?orderId=${order.id}`} className="text-sm font-semibold text-accent hover:underline">
                        {t.buyerSupport.getHelp}
                    </Link>
                </div>
            </div>

            {orderTickets.length > 0 && (
                <section aria-labelledby="order-tickets-title" className="mt-12">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 id="order-tickets-title" className="text-xl font-bold text-foreground">
                            {t.order.yourTickets}
                        </h2>
                        <p className="text-sm text-muted">{t.order.onePerson}</p>
                    </div>
                    <ul className="mt-4 grid gap-4 md:grid-cols-2">
                        {orderTickets.map((ticket) => (
                            <li key={ticket.id}>
                                <TicketCard ticket={ticket} />
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    )
}

export default OrderPage
