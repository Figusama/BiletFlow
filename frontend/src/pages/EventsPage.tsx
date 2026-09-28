import EventArenaPlaceholder from '../features/events/components/EventArenaPlaceholder'

const EventsPage = () => {
	return (
		<div className="min-h-screen bg-background text-foreground">
			<section className="relative min-h-[470px] overflow-hidden">
				<EventArenaPlaceholder />

				<div className="relative z-10 mx-auto max-w-6xl px-6 py-20">
					<div className="max-w-xl">
						<p className="text-sm font-medium text-accent">
							Events across Kazakhstan
						</p>

						<h1 className="mt-4 text-5xl font-semibold leading-[1.08] tracking-[-0.035em] text-foreground">
							Find something
							<br />
							worth going to.
						</h1>

						<p className="mt-5 max-w-lg text-base leading-7 text-muted">
							Discover concerts, festivals, comedy, community events and more
							happening around you.
						</p>

						<div className="mt-8 flex gap-3">
							<input
								type="search"
								placeholder="Search events, venues or cities"
								className="
									min-w-0 flex-1 rounded-[10px]
									border border-border bg-surface
									px-4 py-3 text-sm text-foreground
									outline-none
									placeholder:text-muted
									focus:border-accent
									focus:ring-2 focus:ring-accent/20
								"
							/>

							<button
								type="button"
								className="
									rounded-[10px] bg-accent px-6 py-3
									text-sm font-semibold text-accent-foreground
									transition-opacity hover:opacity-90
									focus-visible:outline-none
									focus-visible:ring-2
									focus-visible:ring-accent
									focus-visible:ring-offset-2
									focus-visible:ring-offset-background
								"
							>
								Search
							</button>
						</div>

						<div className="mt-3 flex flex-wrap gap-2">
							{['Astana', 'Category', 'Date', 'Free / Paid'].map((filter) => (
								<button
									key={filter}
									type="button"
									className="
										rounded-[9px] border border-border
										bg-surface px-4 py-2
										text-sm text-muted
										transition-colors
										hover:bg-surface-raised
										hover:text-foreground
										focus-visible:outline-none
										focus-visible:ring-2
										focus-visible:ring-accent
									"
								>
									{filter}

									<span
										aria-hidden="true"
										className="ml-3 text-muted"
									>
										⌄
									</span>
								</button>
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="mx-auto max-w-6xl px-6 py-10">
				<p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
					Explore
				</p>

				<h2 className="mt-2 text-2xl font-semibold text-foreground">
					Featured events
				</h2>
			</section>
		</div>
	)
}

export default EventsPage