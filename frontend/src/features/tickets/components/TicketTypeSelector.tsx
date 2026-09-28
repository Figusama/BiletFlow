interface TicketTypeSelectorProps {
	name: string
	description?: string
	price: number
	available: number
	quantity: number
	onQuantityChange: (quantity: number) => void
}

const TicketTypeSelector = ({
	name,
	description,
	price,
	available,
	quantity,
	onQuantityChange,
}: TicketTypeSelectorProps) => {
	const decreaseQuantity = () => {
		if (quantity > 0) {
			onQuantityChange(quantity - 1)
		}
	}

	const increaseQuantity = () => {
		if (quantity < available) {
			onQuantityChange(quantity + 1)
		}
	}

	return (
		<div className="p-5">
			<div className="flex items-start justify-between gap-6">
				<div>
					<p className="font-medium text-foreground">
						{name}
					</p>

					{description && (
						<p className="mt-1 text-sm text-muted">
							{description}
						</p>
					)}

					<p className="mt-3 text-sm text-muted">
						{available} available
					</p>
				</div>

				<div className="flex flex-col items-end gap-4">
					<p className="font-semibold text-foreground">
						{price.toLocaleString('en-US')} ₸
					</p>

					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={decreaseQuantity}
							disabled={quantity === 0}
							aria-label={`Decrease ${name} quantity`}
							className="
								flex h-8 w-8 items-center justify-center
								rounded-lg border border-border
								text-foreground
								transition-colors
                                bg-background
                                hover:bg-accent
                                hover:border-accent
                                hover:text-accent-foreground
								disabled:cursor-not-allowed
								disabled:opacity-40
								focus-visible:outline-none
								focus-visible:ring-2
								focus-visible:ring-accent
							"
						>
							−
						</button>

						<span className="min-w-5 text-center text-sm font-medium">
							{quantity}
						</span>

						<button
							type="button"
							onClick={increaseQuantity}
							disabled={quantity >= available}
							aria-label={`Increase ${name} quantity`}
							className="
								flex h-8 w-8 items-center justify-center
								rounded-lg border border-border
								text-foreground
								transition-colors
								bg-background
                                hover:bg-accent
                                hover:border-accent
                                hover:text-accent-foreground
								disabled:cursor-not-allowed
								disabled:opacity-40
								focus-visible:outline-none
								focus-visible:ring-2
								focus-visible:ring-accent
							"
						>
							+
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}

export default TicketTypeSelector