interface OrderSummaryProps {
	ticketTypes: {
		id: string
		name: string
		price: number
	}[]
	quantities: Record<string, number>
}

const OrderSummary = ({
	ticketTypes,
	quantities,
}: OrderSummaryProps) => {
	const selectedTickets = ticketTypes.filter(
		(ticketType) => (quantities[ticketType.id] ?? 0) > 0,
	)

	const total = selectedTickets.reduce((sum, ticketType) => {
		const quantity = quantities[ticketType.id] ?? 0

		return sum + ticketType.price * quantity
	}, 0)

	const hasTickets = selectedTickets.length > 0

	return (
		<div className="rounded-xl border border-border bg-surface-raised p-6">
			<h2 className="text-xl font-semibold text-foreground">
				Order summary
			</h2>

			{hasTickets ? (
				<div className="mt-5">
					<div className="space-y-3">
                        {selectedTickets.map((ticketType) => {
                            const quantity = quantities[ticketType.id] ?? 0
                            const itemTotal = ticketType.price * quantity

                            return (
                                <div
                                    key={ticketType.id}
                                    className="flex justify-between gap-4 text-sm"
                                >
                                    <p className="text-muted">
                                        {ticketType.name} × {quantity}
                                    </p>

                                    <p className="font-medium text-foreground">
                                        {itemTotal.toLocaleString('en-US')} ₸
                                    </p>
                                </div>
                            )
                        })}
					</div>

					<div className="mt-5 border-t border-border pt-5">
						<div className="flex items-center justify-between gap-4">
							<p className="font-medium text-foreground">
								Total
							</p>

							<p className="text-lg font-semibold text-foreground">
								{total.toLocaleString('en-US')} ₸
							</p>
						</div>
					</div>
				</div>
			) : (
				<p className="mt-3 text-sm text-muted">
					Select tickets to continue.
				</p>
			)}

			<button
				type="button"
				disabled={!hasTickets}
				className="
					mt-6 w-full rounded-lg bg-accent
					px-4 py-3 text-sm font-semibold
					text-accent-foreground
					transition-opacity
					hover:opacity-90
					disabled:cursor-not-allowed
					disabled:opacity-40
					focus-visible:outline-none
					focus-visible:ring-2
					focus-visible:ring-accent
					focus-visible:ring-offset-2
					focus-visible:ring-offset-surface-raised
				"
			>
				Continue
			</button>
		</div>
	)
}

export default OrderSummary