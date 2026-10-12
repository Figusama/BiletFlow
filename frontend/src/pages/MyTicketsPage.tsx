import TicketCard from '../features/tickets/components/TicketCard'

// TODO(API): Replace mock tickets with the authenticated user's tickets from the backend.
// TODO(API): Replace mock tickets with the authenticated user's tickets from the backend.
const mockTickets = [
	{
		id: 'ticket-1',
		eventTitle: 'Open Air Almaty',
		startsAt: '2026-10-20T18:00:00+05:00',
		endsAt: '2026-10-20T22:00:00+05:00',
		venueName: 'Almaty Arena',
		ticketType: 'Standard',
		attendeeName: 'Abay Pussyrmanov',
		ticketCode: 'BF-2K7X4M',
		status: 'Valid',
	},
	{
		id: 'ticket-2',
		eventTitle: 'Tech Conference 2026',
		startsAt: '2026-09-15T10:00:00+05:00',
		endsAt: '2026-09-15T18:00:00+05:00',
		venueName: 'Atakent',
		ticketType: 'VIP',
		attendeeName: 'Abay Pussyrmanov',
		ticketCode: 'BF-7H3P9Q',
		status: 'Checked in',
	},
]

const MyTicketsPage = () => {

    const now = new Date()

    const upcomingTickets = mockTickets.filter(
        (ticket) => new Date(ticket.endsAt) >= now,
    )

    const pastTickets = mockTickets.filter(
        (ticket) => new Date(ticket.endsAt) < now,
    )

    const formatEventDate = (date: string) => {
        return new Intl.DateTimeFormat('en', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(date))
    }

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="mx-auto max-w-6xl px-6 py-10">
				<div>
					<h1 className="text-3xl font-semibold tracking-tight">
						My tickets
					</h1>

					<p className="mt-2 text-sm text-muted">
						View and manage your tickets.
					</p>
				</div>

				<div className="mt-8 space-y-10">
                    <section>
                        <h2 className="text-xl font-semibold text-foreground">
                            Upcoming
                        </h2>

                        <div className="mt-4 space-y-4">
                            {upcomingTickets.map((ticket) => (
                                <TicketCard
                                    key={ticket.id}
                                    eventTitle={ticket.eventTitle}
                                    eventDate={formatEventDate(ticket.startsAt)}
                                    venueName={ticket.venueName}
                                    ticketType={ticket.ticketType}
                                    attendeeName={ticket.attendeeName}
                                    ticketCode={ticket.ticketCode}
                                    status={ticket.status}
                                />
                            ))}
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-foreground">
                            Past
                        </h2>

                        <div className="mt-4 space-y-4">
                            {pastTickets.map((ticket) => (
                                <TicketCard
                                    key={ticket.id}
                                    eventTitle={ticket.eventTitle}
                                    eventDate={formatEventDate(ticket.startsAt)}
                                    venueName={ticket.venueName}
                                    ticketType={ticket.ticketType}
                                    attendeeName={ticket.attendeeName}
                                    ticketCode={ticket.ticketCode}
                                    status={ticket.status}
                                />
                            ))}
                        </div>
                    </section>
                </div>
			</div>
		</div>
	)
}

export default MyTicketsPage