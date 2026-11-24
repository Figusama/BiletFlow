import { Link, useParams } from 'react-router-dom'
import { getImageUrls, useEvent } from '../features/events/api'
import { usePricedEvents } from '../features/events/usePricedEvents'
import CalendarMenu from '../features/events/components/CalendarMenu'
import EventFacts from '../features/events/components/EventFacts'
import EventBuyButton from '../features/events/components/EventBuyButton'
import EventGallery from '../features/events/components/EventGallery'
import EventListItem from '../features/events/components/EventListItem'
import ShareButton from '../features/events/components/ShareButton'
import { sortEvents } from '../features/events/filters'
import { formatEventTimeRange, formatPriceFrom } from '../features/events/labels'
import { useTicketTypes } from '../features/tickets/api'
import { getMinPrice } from '../features/tickets/status'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'

const MORE_EVENTS = 3

const EventDetailsPage = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event, isPending, error, refetch } = useEvent(eventId)
    const { data: events } = usePricedEvents()
    const { data: ticketTypes = [] } = useTicketTypes(event?.id)

    if (isPending) {
        return (
            <div className="mx-auto max-w-[1224px] px-4 pt-8 pb-16 sm:px-6">
                <div className="h-[220px] animate-pulse rounded-3xl bg-surface-sunk sm:h-[300px] md:h-[380px]" />
            </div>
        )
    }

    if (!event) {
        const notFound = error instanceof ApiError && error.status === 404

        return (
            <div className="mx-auto grid min-h-[50vh] max-w-md place-items-center px-4 py-16 text-center">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">
                        {notFound ? t.eventPage.notFoundTitle : t.eventPage.loadError}
                    </h1>
                    {notFound && <p className="mt-3 text-muted">{t.eventPage.notFoundText}</p>}
                    <div className="mt-6 flex justify-center gap-4">
                        {!notFound && (
                            <button type="button" onClick={() => refetch()} className="font-semibold text-accent hover:underline">
                                {t.discover.retry}
                            </button>
                        )}
                        <Link to="/" className="font-semibold text-accent hover:underline">
                            {t.common.backToEvents}
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    const categoryLabels: Record<string, string> = t.categories
    const moreEvents = sortEvents(
        events.filter((item) => item.id !== event.id && item.venue_city === event.venue_city),
        'date',
    ).slice(0, MORE_EVENTS)
    const priceLabel = formatPriceFrom(event.price_from ?? getMinPrice(ticketTypes), t)
    const moreTitle = (event.venue_city && t.city.more[event.venue_city]) || t.eventPage.moreEvents

    return (
        <div className="mx-auto max-w-[1224px] px-4 pt-8 pb-16 sm:px-6">
            <EventGallery images={getImageUrls(event)} title={event.title} className="h-[220px] sm:h-[300px] md:h-[380px]" />

            <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    {event.categories && event.categories.length > 0 && (
                        <ul className="mb-3 flex flex-wrap gap-2">
                            {event.categories.map(({ slug, name }) => (
                                <li key={slug} className="rounded-md bg-surface-sunk px-2 py-0.5 text-sm text-muted">
                                    {categoryLabels[slug] ?? name}
                                </li>
                            ))}
                        </ul>
                    )}
                    <h1 className="text-3xl leading-tight font-bold text-foreground md:text-4xl">{event.title}</h1>
                    <p className="mt-2 flex flex-wrap gap-x-4 text-muted">
                        <span>{formatEventTimeRange(event, t)}</span>
                        {event.venue_name && <span>{event.venue_name}</span>}
                    </p>
                </div>

                <EventBuyButton event={event} ticketTypes={ticketTypes} />
            </div>

            <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-16">
                <section aria-labelledby="about-title">
                    <h2 id="about-title" className="text-xl font-bold text-foreground">
                        {t.eventPage.about}
                    </h2>
                    <p className="mt-4 leading-7 whitespace-pre-line text-foreground">{event.description}</p>
                    <div className="mt-4 -ml-3 flex flex-wrap gap-1">
                        <CalendarMenu event={event} />
                        <ShareButton title={event.title} path={`/events/${event.slug}`} />
                    </div>
                </section>

                <EventFacts event={event} priceLabel={priceLabel} />
            </div>

            {moreEvents.length > 0 && (
                <section aria-labelledby="more-title" className="mt-14">
                    <h2 id="more-title" className="text-xl font-bold text-foreground">
                        {moreTitle}
                    </h2>
                    <ul className="mt-5 flex flex-col gap-4">
                        {moreEvents.map((item) => (
                            <li key={item.id}>
                                <EventListItem event={item} />
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    )
}

export default EventDetailsPage
