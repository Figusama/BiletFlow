import { Link, useParams } from 'react-router-dom'
import SeatMapPreviewPlaceholder from '../features/tickets/components/SeatMapPreviewPlaceholder'
import { useState } from 'react'
import TicketTypeSelector from '../features/tickets/components/TicketTypeSelector'
import OrderSummary from '../features/tickets/components/OrderSummary'

interface TicketType {
	id: string
	name: string
	description: string
	price: number
	available: number
}

const ticketTypes: TicketType[] = [
	{
		id: 'standard',
		name: 'Standard',
		description: 'General admission',
		price: 8000,
		available: 120,
	},
	{
		id: 'vip',
		name: 'VIP',
		description: 'Priority access and premium seating',
		price: 15000,
		available: 24,
	},
]


const TicketSelectionPage = () => {
	const { eventId } = useParams()
    const [quantities, setQuantities] = useState<Record<string, number>>({})

    const handleQuantityChange = (ticketTypeId: string, quantity: number) => {
        setQuantities((current) => ({
            ...current,
            [ticketTypeId]: quantity,
        }))
    }

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="mx-auto max-w-6xl px-6 py-10">
				<Link
					to={`/events/${eventId}`}
					className="
						inline-flex items-center gap-2
						text-sm font-medium text-muted
						transition-colors
						hover:text-foreground
						focus-visible:rounded-md
						focus-visible:outline-none
						focus-visible:ring-2
						focus-visible:ring-accent
					"
				>
					<span aria-hidden="true">←</span>
					Back to event
				</Link>

				<h1 className="mt-6 text-3xl font-semibold tracking-tight">
					Select tickets
				</h1>
                <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
                    <main className="min-w-0">
                        <SeatMapPreviewPlaceholder />
                        <div className="mt-6">
                            <h2 className="text-xl font-semibold">
                                Ticket types
                            </h2>

                            <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface">
                                {ticketTypes.map((ticketType) => (
                                    <TicketTypeSelector
                                        key={ticketType.id}
                                        name={ticketType.name}
                                        description={ticketType.description}
                                        price={ticketType.price}
                                        available={ticketType.available}
                                        quantity={quantities[ticketType.id] ?? 0}
                                        onQuantityChange={(quantity) =>
                                            handleQuantityChange(ticketType.id, quantity)
                                        }
                                    />
                                ))}
                            </div>
                        </div>
                    </main>

                    <aside>
                        <OrderSummary
                            ticketTypes={ticketTypes}
	                        quantities={quantities}
                        />
                    </aside>
                </div>
			</div>
		</div>
	)
}

export default TicketSelectionPage