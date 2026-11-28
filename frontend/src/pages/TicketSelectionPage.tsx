import { useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { RootState } from '../app/store'
import { useEvent } from '../features/events/api'
import { formatEventTimeRange } from '../features/events/labels'
import CheckoutSteps from '../features/orders/components/CheckoutSteps'
import { createReservation, useSeats, useTicketTypes, type ReservationRequest, type Seat } from '../features/tickets/api'
import OrderSummary, { type SummaryItem } from '../features/tickets/components/OrderSummary'
import SeatMap from '../features/tickets/components/SeatMap'
import TicketPicker from '../features/tickets/components/TicketPicker'
import { getTypeColor, groupSeats } from '../features/tickets/seats'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'

const TicketSelectionPage = () => {
    const { t } = useLanguage()
    const navigate = useNavigate()
    const location = useLocation()
    const { eventId = '' } = useParams()
    const user = useSelector((state: RootState) => state.auth.user)
    const { data: event, isPending } = useEvent(eventId)
    const isAssigned = event?.seating_mode === 'ASSIGNED_SEATING'
    const { data: ticketTypes = [] } = useTicketTypes(event?.id)
    const { data: seats = [], refetch: refetchSeats } = useSeats(event?.id, isAssigned)

    const [quantities, setQuantities] = useState<Record<string, number>>({})
    const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([])
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

    const typeById = new Map(ticketTypes.map((type) => [type.id, type]))
    const colorOf = (ticketTypeId: string | null) => getTypeColor(ticketTypes, ticketTypeId)

    const seatsForSale = seats.map((seat) => {
        const type = seat.ticket_type_id ? typeById.get(seat.ticket_type_id) : undefined
        const isOnSale = type?.sale_state === 'ON_SALE'
        return seat.state === 'AVAILABLE' && !isOnSale ? { ...seat, state: 'UNAVAILABLE' as const } : seat
    })
    const seatById = new Map(seats.map((seat) => [seat.id, seat]))

    const items: SummaryItem[] = isAssigned
        ? selectedSeatIds.flatMap((id) => {
              const seat = seatById.get(id)
              const type = seat?.ticket_type_id ? typeById.get(seat.ticket_type_id) : undefined
              if (!seat || !type) return []
              return [{ key: id, label: `${type.name}, ${t.seats.seatLabel(seat.section, seat.row, seat.seat_number)}`, price: type.price_minor }]
          })
        : ticketTypes
              .filter((type) => (quantities[type.id] ?? 0) > 0)
              .map((type) => ({ key: type.id, label: `${type.name} × ${quantities[type.id]}`, price: type.price_minor * quantities[type.id] }))

    const changeQuantity = (ticketTypeId: string, quantity: number) => {
        setQuantities((current) => ({ ...current, [ticketTypeId]: quantity }))
        setError('')
    }

    const toggleSeat = (seat: Seat) => {
        setError('')
        if (selectedSeatIds.includes(seat.id)) {
            setSelectedSeatIds((current) => current.filter((id) => id !== seat.id))
            return
        }

        const type = seat.ticket_type_id ? typeById.get(seat.ticket_type_id) : undefined
        const sameType = selectedSeatIds.filter((id) => seatById.get(id)?.ticket_type_id === seat.ticket_type_id).length
        if (type && sameType >= type.max_per_order) {
            setError(t.seats.limit(type.name, type.max_per_order))
            return
        }
        setSelectedSeatIds((current) => [...current, seat.id])
    }

    const handleContinue = async () => {
        if (!user) {
            navigate('/auth/token', { state: { from: location.pathname } })
            return
        }

        setIsSubmitting(true)
        setError('')

        const request: ReservationRequest = isAssigned
            ? { event_seat_ids: selectedSeatIds }
            : { items: items.map(({ key }) => ({ ticket_type_id: key, quantity: quantities[key] })) }

        try {
            const reservation = await createReservation(event.id, request)
            navigate(`/checkout/${reservation.id}`)
        } catch (reserveError) {
            if (isAssigned && reserveError instanceof ApiError && reserveError.status === 409) {
                const { data: fresh = [] } = await refetchSeats()
                const available = new Set(fresh.filter((seat) => seat.state === 'AVAILABLE').map((seat) => seat.id))
                setSelectedSeatIds((current) => current.filter((id) => available.has(id)))
                setError(t.seats.seatTaken)
            } else {
                setError(t.tickets.reserveFailed)
            }
            setIsSubmitting(false)
        }
    }

    return (
        <div className="mx-auto max-w-[1224px] px-4 pt-8 pb-16 sm:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        {isAssigned ? t.seats.title : t.ticketSelection.title}
                    </h1>
                    <Link to={`/events/${event.slug}`} className="mt-2 block font-semibold text-foreground hover:text-accent">
                        {event.title}
                    </Link>
                    <p className="flex flex-wrap gap-x-4 text-sm text-muted">
                        <span>{formatEventTimeRange(event, t)}</span>
                        {event.venue_name && <span>{event.venue_name}</span>}
                    </p>
                </div>

                <CheckoutSteps current={0} />
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                <section aria-label={t.tickets.title} className="min-w-0">
                    {ticketTypes.length === 0 ? (
                        <p className="text-muted">{t.tickets.noTickets}</p>
                    ) : isAssigned ? (
                        <SeatMap
                            sections={groupSeats(seatsForSale)}
                            ticketTypes={ticketTypes}
                            colorOf={colorOf}
                            selectedIds={selectedSeatIds}
                            onToggle={toggleSeat}
                        />
                    ) : (
                        <TicketPicker ticketTypes={ticketTypes} quantities={quantities} onChange={changeQuantity} timeZone={event.timezone} />
                    )}
                </section>

                <aside className="lg:sticky lg:top-24">
                    <OrderSummary
                        items={items}
                        isSignedIn={Boolean(user)}
                        isSubmitting={isSubmitting}
                        error={error}
                        onContinue={handleContinue}
                    />
                </aside>
            </div>
        </div>
    )
}

export default TicketSelectionPage
