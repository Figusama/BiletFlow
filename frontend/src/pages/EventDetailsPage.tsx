import { Link, useParams } from 'react-router-dom'

const EventDetailsPage = () => {
	const { eventId } = useParams()

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="mx-auto max-w-6xl px-6 py-10">
				<Link
					to="/"
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
					Events
				</Link>

				<div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
					<main>
						<div
							className="
								flex aspect-[16/9]
								items-center justify-center
								overflow-hidden rounded-xl
								bg-surface
								text-sm text-muted
							"
						>
							Event cover : {eventId}
						</div>
                        <div className="mt-6">
                            <span
                                className="
                                    inline-flex rounded-full
                                    border border-border bg-surface
                                    px-3 py-1
                                    text-xs font-medium text-foreground
                                "
                            >
                                Music
                            </span>

                            <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                                Astana Music Festival
                            </h1>

                            <div className="mt-5 space-y-2 text-sm text-muted">
                                <p className="flex items-center gap-2">
                                    Oct 15, 2026 · 19:00
                                </p>

                                <p className="flex items-center gap-2">
                                    Astana · Barys Arena
                                </p>
                            </div>
                        </div>

                        <a
                            href="#tickets"
                            className="
                                mt-5 inline-flex rounded-lg bg-accent
                                px-4 py-2.5 text-sm font-semibold
                                text-accent-foreground
                                transition-opacity
                                hover:opacity-90
                                focus-visible:outline-none
                                focus-visible:ring-2
                                focus-visible:ring-accent
                                lg:hidden
                            "
                        >
                            View tickets
                        </a>

                        <div className="mt-8 border-t border-border pt-7">
                            <h2 className="text-xl font-semibold">
                                About this event
                            </h2>

                            <div className="mt-4 space-y-4 text-sm leading-6 text-muted">
                                <p>
                                    Experience the grandest musical celebration of the year at Barys Arena.
                                    Featuring top local and international artists, this year's festival
                                    brings a state-of-the-art sound system and unforgettable visual
                                    productions.
                                </p>

                                <p>
                                    Doors open at 18:00. Food and beverage stations will be available
                                    throughout the venue. Please secure your tickets in advance.
                                </p>
                            </div>
                        </div>

                        <div className="mt-8 border-t border-border pt-7">
                            <h2 className="text-xl font-semibold">
                                Venue
                            </h2>

                            <div className="mt-4">
                                <p className="font-medium text-foreground">
                                    Barys Arena
                                </p>

                                <p className="mt-1 text-sm text-muted">
                                    Astana, Kazakhstan
                                </p>
                            </div>
                        </div>

					</main>

                    

					<aside id="tickets">
                        <div className="rounded-xl border border-border bg-surface p-6">
                            <h2 className="text-xl font-semibold text-foreground">
                                Tickets
                            </h2>

                            <div className="mt-5 divide-y divide-border">
                                <div className="pb-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-medium text-foreground">
                                                General Admission
                                            </p>

                                            <p className="mt-1 text-sm text-muted">
                                                Standing area
                                            </p>
                                        </div>

                                        <p className="shrink-0 font-semibold text-foreground">
                                            8 000 ₸
                                        </p>
                                    </div>
                                </div>

                                <div className="pt-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-medium text-foreground">
                                                VIP
                                            </p>

                                            <p className="mt-1 text-sm text-muted">
                                                Priority access
                                            </p>
                                        </div>

                                        <p className="shrink-0 font-semibold text-foreground">
                                            15 000 ₸
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <Link
                                to={`/events/${eventId}/tickets`}
                                className="
                                    mt-6 flex w-full items-center justify-center
                                    rounded-lg bg-accent px-4 py-3
                                    text-sm font-semibold text-accent-foreground
                                    transition-opacity
                                    hover:opacity-90
                                    focus-visible:outline-none
                                    focus-visible:ring-2
                                    focus-visible:ring-accent
                                    focus-visible:ring-offset-2
                                    focus-visible:ring-offset-surface
                                "
                            >
                                Get tickets
                            </Link>
                        </div>
                    </aside>
				</div>
			</div>
		</div>
	)
}

export default EventDetailsPage