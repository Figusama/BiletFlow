import { useState } from 'react'
import TicketStatusBadge, {
	type TicketStatus,
} from './TicketStatusBadge'

interface TicketCardProps {
	eventTitle: string
	eventDate: string
	venueName: string
	ticketType: string
	attendeeName: string
	ticketCode: string
	status: TicketStatus
}

const TicketCard = ({
	eventTitle,
	eventDate,
	venueName,
	ticketType,
	attendeeName,
	ticketCode,
	status,
}: TicketCardProps) => {
	const [isExpanded, setIsExpanded] = useState(false)

	return (
		<article className="overflow-hidden rounded-xl border border-border bg-surface">
			<div className="p-5">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<h2 className="text-lg font-semibold text-foreground">
							{eventTitle}
						</h2>

						<p className="mt-2 text-sm text-muted">
							{eventDate}
						</p>

						<p className="mt-1 text-sm text-muted">
							{venueName}
						</p>
					</div>

					<div className="flex shrink-0 items-center gap-3">
						<TicketStatusBadge status={status} />

						<button
							type="button"
							onClick={() => setIsExpanded((current) => !current)}
							aria-expanded={isExpanded}
							aria-label={
								isExpanded
									? 'Hide ticket details'
									: 'Show ticket details'
							}
							className="
								flex h-8 w-8 items-center justify-center
								rounded-lg border border-border
								text-foreground transition
								hover:border-accent hover:text-accent
								focus-visible:outline-none
								focus-visible:ring-2
								focus-visible:ring-accent
							"
						>
							<span
								aria-hidden="true"
								className={`transition-transform ${
									isExpanded ? 'rotate-180' : ''
								}`}
							>
								⌄
							</span>
						</button>
					</div>
				</div>

				<div className="mt-5 border-t border-border pt-4">
					<p className="text-xs text-muted">
						Ticket type
					</p>

					<p className="mt-1 text-sm font-medium text-foreground">
						{ticketType}
					</p>
				</div>
			</div>

			{isExpanded && (
				<div className="border-t border-dashed border-border bg-surface-raised p-5">
					<div className="flex flex-col items-center">
						{/* TODO(API): Replace this placeholder with the issued ticket QR data from the backend. */}
						<div
							className="
								flex aspect-square w-40 items-center justify-center
								rounded-lg border border-border bg-background
								text-sm text-muted
							"
						>
							QR code
						</div>

						<div className="mt-5 w-full">
							<div className="flex justify-between gap-4 text-sm">
								<span className="text-muted">
									Attendee
								</span>

								<span className="text-right font-medium text-foreground">
									{attendeeName}
								</span>
							</div>

							<div className="mt-3 flex justify-between gap-4 text-sm">
								<span className="text-muted">
									Ticket
								</span>

								<span className="text-right font-medium text-foreground">
									{ticketCode}
								</span>
							</div>
						</div>

						{/* TODO(API): Connect this action to the ticket PDF download endpoint. */}
						<button
							type="button"
							disabled
							className="
								mt-6 w-full rounded-lg border border-border
								px-4 py-3 text-sm font-semibold text-muted
								disabled:cursor-not-allowed
								disabled:opacity-50
							"
						>
							Download PDF
						</button>
					</div>
				</div>
			)}
		</article>
	)
}

export default TicketCard