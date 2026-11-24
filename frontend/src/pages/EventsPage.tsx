import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowIcon, ChevronIcon } from '../components/ui/icons'
import Select from '../components/ui/Select'
import { useCity } from '../features/events/city'
import { usePricedEvents } from '../features/events/usePricedEvents'
import DayPicker from '../features/events/components/DayPicker'
import EventFiltersBar from '../features/events/components/EventFiltersBar'
import EventHero from '../features/events/components/EventHero'
import EventListItem from '../features/events/components/EventListItem'
import {
    EMPTY_FILTERS,
    filterEvents,
    getCategories,
    getEventDayKey,
    sortEvents,
    type EventFilters,
    type SortOrder,
} from '../features/events/filters'
import { useLanguage } from '../shared/i18n/language'
import { getNextDays } from '../shared/lib/date'

const PAGE_SIZE = 4
const HERO_EVENTS = 3
const DAYS_TO_SHOW = 21

const EventsPage = () => {
    const { t } = useLanguage()
    const { city } = useCity()
    const [searchParams, setSearchParams] = useSearchParams()
    const search = searchParams.get('search') ?? ''

    const { data: events, isPending, isError, refetch } = usePricedEvents()
    const [filters, setFilters] = useState<EventFilters>(EMPTY_FILTERS)
    const [sortOrder, setSortOrder] = useState<SortOrder>('date')
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
    const [days] = useState(() => getNextDays(DAYS_TO_SHOW))

    const updateFilters = (changes: Partial<EventFilters>) => {
        setFilters((current) => ({ ...current, ...changes }))
        setVisibleCount(PAGE_SIZE)
    }

    const resetFilters = () => {
        setFilters(EMPTY_FILTERS)
        setVisibleCount(PAGE_SIZE)
    }

    const cityEvents = city ? events.filter((event) => event.venue_city === city) : events
    const heroEvents = sortEvents(cityEvents, 'date').slice(0, HERO_EVENTS)
    const daysWithEvents = new Set(cityEvents.map(getEventDayKey))
    const results = sortEvents(filterEvents(events, filters, search, city), sortOrder)
    const title = (city && t.city.titles[city]) || t.discover.title
    const visibleEvents = results.slice(0, visibleCount)

    const sortOptions = [
        { value: 'date', label: t.discover.sortByDate },
        { value: 'price', label: t.discover.sortByPrice },
    ] as const

    return (
        <div className="mx-auto max-w-[1224px] px-4 pt-8 pb-16 sm:px-6 md:pt-10">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>

            <div className="mt-5">
                {isPending ? (
                    <div className="h-[260px] animate-pulse rounded-3xl bg-surface-sunk md:h-[340px]" />
                ) : (
                    <EventHero events={heroEvents} />
                )}
            </div>

            <section aria-labelledby="pick-day-title" className="mt-10">
                <h2 id="pick-day-title" className="text-xl font-bold text-foreground">
                    {t.discover.pickDay}
                </h2>
                <div className="mt-4">
                    <DayPicker
                        days={days}
                        selectedDay={filters.day}
                        daysWithEvents={daysWithEvents}
                        onSelect={(day) => updateFilters({ day })}
                    />
                </div>
            </section>

            <div className="mt-6">
                <EventFiltersBar categories={getCategories(events)} filters={filters} onChange={updateFilters} />
            </div>

            <section aria-labelledby="upcoming-title" className="mt-10">
                <div className="flex items-center justify-between gap-4">
                    <h2 id="upcoming-title" className="text-xl font-bold text-foreground">
                        {t.discover.upcoming}
                    </h2>
                    <Select<SortOrder>
                        value={sortOrder}
                        options={sortOptions}
                        onValueChange={setSortOrder}
                        ariaLabel={t.discover.sortLabel}
                    />
                </div>

                {search && (
                    <p className="mt-3 text-sm text-muted">
                        {t.discover.searchResults(search)}{' '}
                        <button
                            type="button"
                            onClick={() => setSearchParams({})}
                            className="font-semibold text-accent hover:underline"
                        >
                            {t.discover.clearSearch}
                        </button>
                    </p>
                )}

                <div className="mt-6">
                    {isPending && (
                        <p role="status" className="py-10 text-center text-muted">
                            {t.discover.loading}
                        </p>
                    )}

                    {isError && events.length === 0 && (
                        <div role="alert" className="py-10 text-center">
                            <p className="text-muted">{t.discover.loadError}</p>
                            <button
                                type="button"
                                onClick={() => refetch()}
                                className="mt-3 font-semibold text-accent hover:underline"
                            >
                                {t.discover.retry}
                            </button>
                        </div>
                    )}

                    {!isPending && !isError && results.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
                            <p className="text-muted">{t.discover.empty}</p>
                            <button
                                type="button"
                                onClick={resetFilters}
                                className="mt-3 font-semibold text-accent hover:underline"
                            >
                                {t.discover.resetFilters}
                            </button>
                        </div>
                    )}

                    {visibleEvents.length > 0 && (
                        <ul className="flex flex-col gap-4">
                            {visibleEvents.map((event) => (
                                <li key={event.id}>
                                    <EventListItem event={event} />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {results.length > visibleCount && (
                    <div className="mt-8 text-center">
                        <button
                            type="button"
                            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                            className="inline-flex items-center gap-2 font-semibold text-accent hover:underline"
                        >
                            {t.discover.seeMore}
                            <ChevronIcon className="size-4 -rotate-90" />
                        </button>
                    </div>
                )}
            </section>

            <div className="mt-14 flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-lg font-bold text-foreground">{t.discover.hosting}</h2>
                <Link
                    to="/organizer/events/new"
                    className="inline-flex items-center gap-2 font-semibold text-accent hover:underline"
                >
                    {t.organizer.createEvent}
                    <ArrowIcon className="size-4 rotate-90" />
                </Link>
            </div>
        </div>
    )
}

export default EventsPage
