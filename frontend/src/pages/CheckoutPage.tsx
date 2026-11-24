import { useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { RootState } from '../app/store'
import Button from '../components/ui/Button'
import { useEvent } from '../features/events/api'
import { formatEventTimeRange } from '../features/events/labels'
import { createOrder, releaseReservation, startPayment, useReservation, type PromoQuote } from '../features/orders/api'
import CheckoutSteps from '../features/orders/components/CheckoutSteps'
import PromoCodeForm from '../features/orders/components/PromoCodeForm'
import { useTicketTypes } from '../features/tickets/api'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'
import { formatSeconds, useSecondsLeft } from '../shared/lib/useSecondsLeft'

const pageClass = 'mx-auto max-w-[1224px] px-4 pt-8 pb-16 sm:px-6'

const CheckoutPage = () => {
    const { t } = useLanguage()
    const navigate = useNavigate()
    const { reservationId = '' } = useParams()
    const user = useSelector((state: RootState) => state.auth.user)
    const { data: reservation, isPending } = useReservation(reservationId)
    const { data: event } = useEvent(reservation?.event_id ?? '')
    const { data: ticketTypes = [] } = useTicketTypes(reservation?.event_id)
    const secondsLeft = useSecondsLeft(reservation?.expires_at)

    const [quote, setQuote] = useState<PromoQuote | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')

    const ticketsPath = event ? `/events/${event.slug}/tickets` : '/'
    const formatPrice = (minor: number) => (minor === 0 ? t.discover.free : formatKzt(minor))

    if (isPending) {
        return <div className={`${pageClass} h-96 animate-pulse`} />
    }

    const isActive = reservation && (reservation.status === 'ACTIVE' || reservation.status === 'PROTECTED')
    const isExpired = !isActive || reservation.is_expired || secondsLeft === 0

    if (isExpired) {
        return (
            <div className="mx-auto max-w-md px-4 py-16 text-center">
                <h1 className="text-2xl font-bold text-foreground">{t.checkout.title}</h1>
                <p className="mt-3 text-muted">{reservation ? t.checkout.expired : t.checkout.notFound}</p>
                <Link to={ticketsPath} className="mt-6 inline-block font-semibold text-accent hover:underline">
                    {t.checkout.chooseAgain}
                </Link>
            </div>
        )
    }

    const lines = reservation.items.map((item) => {
        const ticketType = ticketTypes.find((type) => type.id === item.ticket_type_id)
        const price = ticketType?.price_minor ?? 0
        return { id: item.ticket_type_id, name: ticketType?.name ?? '', quantity: item.quantity, total: price * item.quantity }
    })
    const subtotal = lines.reduce((sum, line) => sum + line.total, 0)
    const total = quote?.total_minor ?? subtotal

    const handlePay = async () => {
        setIsSubmitting(true)
        setError('')

        let orderId: string
        try {
            const order = await createOrder(reservation.id, quote?.code ?? null)
            orderId = order.id
            if (!order.requires_payment) {
                navigate(`/orders/${order.id}`)
                return
            }
        } catch (orderError) {
            setError(orderError instanceof ApiError && orderError.status === 409 ? t.checkout.orderConflict : t.checkout.orderFailed)
            setIsSubmitting(false)
            return
        }

        try {
            const payment = await startPayment(orderId)
            if (payment.payment_url) {
                window.location.assign(payment.payment_url)
                return
            }
        } catch {
            setError(t.checkout.paymentFailed)
        }
        navigate(`/orders/${orderId}`)
    }

    const handleCancel = async () => {
        await releaseReservation(reservation.id).catch(() => undefined)
        navigate(ticketsPath)
    }

    return (
        <div className={pageClass}>
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">{t.checkout.title}</h1>
                    {event && (
                        <>
                            <p className="mt-2 font-semibold text-foreground">{event.title}</p>
                            <p className="flex flex-wrap gap-x-4 text-sm text-muted">
                                <span>{formatEventTimeRange(event, t)}</span>
                                {event.venue_name && <span>{event.venue_name}</span>}
                            </p>
                        </>
                    )}
                </div>
                <CheckoutSteps current={1} />
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                <div className="flex flex-col gap-6">
                    <p role="timer" className="rounded-xl bg-badge-warning-bg px-4 py-3 text-sm font-semibold text-badge-warning-fg">
                        {t.checkout.timeLeft(formatSeconds(secondsLeft ?? 0))}
                    </p>

                    {user && (
                        <section aria-labelledby="buyer-title">
                            <h2 id="buyer-title" className="text-lg font-bold text-foreground">
                                {t.checkout.buyer}
                            </h2>
                            <p className="mt-2 font-semibold text-foreground">{user.fullName}</p>
                            <p className="text-sm text-muted">{t.checkout.ticketsSentTo(user.email)}</p>
                        </section>
                    )}

                    <div className="max-w-md">
                        <PromoCodeForm reservationId={reservation.id} quote={quote} onChange={setQuote} />
                    </div>
                </div>

                <aside className="rounded-2xl border border-border bg-surface p-5 lg:sticky lg:top-24">
                    <h2 className="text-base font-bold text-foreground">{t.ticketSelection.summary}</h2>
                    <ul className="mt-4 flex flex-col gap-2 text-sm">
                        {lines.map((line) => (
                            <li key={line.id} className="flex justify-between gap-3 text-foreground">
                                <span>
                                    {line.name} × {line.quantity}
                                </span>
                                <span className="font-semibold whitespace-nowrap">{formatPrice(line.total)}</span>
                            </li>
                        ))}
                    </ul>

                    {quote && (
                        <dl className="mt-4 flex flex-col gap-1 border-t border-border pt-4 text-sm">
                            <div className="flex justify-between">
                                <dt className="text-muted">{t.checkout.subtotal}</dt>
                                <dd className="text-foreground">{formatPrice(subtotal)}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-muted">{t.checkout.discount}</dt>
                                <dd className="text-badge-success-fg">−{formatKzt(quote.discount_minor)}</dd>
                            </div>
                        </dl>
                    )}

                    <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-border pt-4">
                        <span className="text-sm text-muted">{t.tickets.total}</span>
                        <span className="text-2xl font-bold text-foreground">{formatPrice(total)}</span>
                    </div>

                    {error && (
                        <p role="alert" className="mt-4 text-sm font-medium text-error">
                            {error}
                        </p>
                    )}

                    <Button type="button" fullWidth shape="pill" disabled={isSubmitting} onClick={handlePay} className="mt-5 min-h-11">
                        {isSubmitting ? t.checkout.processing : total === 0 ? t.checkout.getFree : t.checkout.pay}
                    </Button>
                    <button
                        type="button"
                        onClick={handleCancel}
                        disabled={isSubmitting}
                        className="mt-3 w-full text-center text-sm text-muted hover:text-foreground"
                    >
                        {t.checkout.cancel}
                    </button>
                </aside>
            </div>
        </div>
    )
}

export default CheckoutPage
