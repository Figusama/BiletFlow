import { useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { RootState } from '../app/store'
import { useEvent } from '../features/events/api'
import { formatEventTimeRange } from '../features/events/labels'
import { createReservation, useTicketTypes } from '../features/tickets/api'
import OrderSummary, { type OrderLine } from '../features/tickets/components/OrderSummary'
import TicketPicker from '../features/tickets/components/TicketPicker'
import { useLanguage } from '../shared/i18n/language'

const TicketSelectionPage = () => {
    const { t } = useLanguage()
    const navigate = useNavigate()
    const location = useLocation()
    const { eventId = '' } = useParams()
    const user = useSelector((state: RootState) => state.auth.user)
    const { data: event, isPending } = useEvent(eventId)
    const { data: ticketTypes = [] } = useTicketTypes(event?.id)

    const [quantities, setQuantities] = useState<Record<string, number>>({})
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')

    if (isPending) {
        return <div className="mx-auto h-96 max-w-[1224px] animate-pulse px-4 pt-10 sm:px-6" />
    }

    if (!event) {
        return (
            <div className="mx-auto max-w-md px-4 py-16 text-center">
                <h1 className="text-2xl font-bold text-foreground">{t.eventPage.notFoundTitle}</h1>
                <Link to="/" className="mt-6 inline-block font-semibold text-accent hover:underline">
                    {t.common.backToEvents}
                </Link>
            </div>
        )
    }

    const lines: OrderLine[] = ticketTypes
        .filter((ticketType) => (quantities[ticketType.id] ?? 0) > 0)
        .map((ticketType) => ({ ticketType, quantity: quantities[ticketType.id] }))

    const changeQuantity = (ticketTypeId: string, quantity: number) => {
        setQuantities((current) => ({ ...current, [ticketTypeId]: quantity }))
        setError('')
    }

    const handleContinue = async () => {
        if (!user) {
            navigate('/login', { state: { from: location.pathname } })
            return
        }

        setIsSubmitting(true)
        setError('')

        try {
            const reservation = await createReservation(
                event.id,
                lines.map(({ ticketType, quantity }) => ({ ticket_type_id: ticketType.id, quantity })),
            )
            navigate(`/checkout/${reservation.id}`)
        } catch {
            setError(t.tickets.reserveFailed)
            setIsSubmitting(false)
        }
    }

    return (
        <div className="mx-auto max-w-[1224px] px-4 pt-8 pb-16 sm:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">{t.ticketSelection.title}</h1>
                    <Link to={`/events/${event.slug}`} className="mt-2 block font-semibold text-foreground hover:text-accent">
                        {event.title}
                    </Link>
                    <p className="flex flex-wrap gap-x-4 text-sm text-muted">
                        <span>{formatEventTimeRange(event, t)}</span>
                        {event.venue_name && <span>{event.venue_name}</span>}
                    </p>
                </div>

                <ol className="flex items-center gap-2 text-sm">
                    {t.ticketSelection.steps.map((step, index) => (
                        <li key={step} className="flex items-center gap-2">
                            {index > 0 && <span aria-hidden="true" className="h-px w-6 bg-border-strong" />}
                            <span
                                aria-current={index === 0 ? 'step' : undefined}
                                className={`grid size-6 place-items-center rounded-full text-xs font-bold ${
                                    index === 0 ? 'bg-accent text-accent-foreground' : 'bg-surface-sunk text-muted'
                                }`}
                            >
                                {index + 1}
                            </span>
                            <span className={index === 0 ? 'font-semibold text-foreground' : 'text-muted'}>{step}</span>
                        </li>
                    ))}
                </ol>
            </div>

            {event.seating_mode === 'ASSIGNED_SEATING' ? (
                <p className="mt-10 rounded-2xl border border-dashed border-border py-12 text-center text-muted">
                    {t.ticketSelection.seatingSoon}
                </p>
            ) : (
                <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                    <section aria-label={t.tickets.title}>
                        {ticketTypes.length === 0 ? (
                            <p className="text-muted">{t.tickets.noTickets}</p>
                        ) : (
                            <TicketPicker
                                ticketTypes={ticketTypes}
                                quantities={quantities}
                                onChange={changeQuantity}
                                timeZone={event.timezone}
                            />
                        )}
                    </section>

                    <aside className="lg:sticky lg:top-24">
                        <OrderSummary
                            lines={lines}
                            isSignedIn={Boolean(user)}
                            isSubmitting={isSubmitting}
                            error={error}
                            onContinue={handleContinue}
                        />
                    </aside>
                </div>
            )}
        </div>
    )
}

export default TicketSelectionPage
