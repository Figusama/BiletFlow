import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../../shared/i18n/language'
import { useSwipe } from '../../../shared/lib/useSwipe'
import type { EventSummary } from '../api'
import { formatEventDate, getCategoryLabel, getPriceLabel } from '../labels'
import EventBanner from './EventBanner'
import Icon from '../../../components/ui/Icon'

interface EventHeroProps {
    events: EventSummary[]
}

const arrowClass =
    'absolute top-1/2 z-10 hidden h-20 w-7 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-night-deep/60 text-white backdrop-blur hover:bg-night-deep/80 focus-visible:outline-2 focus-visible:outline-accent md:grid'

const EventHero = ({ events }: EventHeroProps) => {
    const { t } = useLanguage()
    const [index, setIndex] = useState(0)
    const goTo = (next: number) => setIndex((next + events.length) % events.length)
    const swipe = useSwipe(() => goTo(index - 1), () => goTo(index + 1))

    if (events.length === 0) return null

    const event = events[index % events.length]

    return (
        <section aria-roledescription="carousel" aria-label={t.discover.title} className="relative">
            <div {...swipe} className="relative touch-pan-y">
                <EventBanner
                    image={event.images?.[0]}
                    overline={[getCategoryLabel(event, t), formatEventDate(event, t)]}
                    title={event.title}
                    subtitle={[event.venue_name, getPriceLabel(event, t)]}
                >
                    <Link
                        to={`/events/${event.slug}`}
                        className="mt-6 inline-flex h-10 items-center rounded-full bg-white px-6 text-sm font-semibold text-night hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                        {t.discover.aboutEvent}
                    </Link>
                </EventBanner>

                {events.length > 1 && (
                    <div className="absolute right-6 bottom-6 flex items-center gap-2">
                        {events.map((item, dotIndex) => (
                            <button
                                key={item.id}
                                type="button"
                                aria-label={t.discover.showSlide(dotIndex + 1)}
                                aria-current={dotIndex === index}
                                onClick={() => goTo(dotIndex)}
                                className="h-1.5 w-1.5 rounded-full bg-white/60 transition-all aria-[current=true]:w-6 aria-[current=true]:bg-white"
                            />
                        ))}
                    </div>
                )}
            </div>

            {events.length > 1 && (
                <>
                    <button
                        type="button"
                        aria-label={t.discover.previous}
                        onClick={() => goTo(index - 1)}
                        className={`${arrowClass} -left-4`}
                    >
                        <Icon name="chevron-left" className="size-5" />
                    </button>
                    <button
                        type="button"
                        aria-label={t.discover.next}
                        onClick={() => goTo(index + 1)}
                        className={`${arrowClass} -right-4`}
                    >
                        <Icon name="chevron-left" className="size-5 rotate-180" />
                    </button>
                </>
            )}
        </section>
    )
}

export default EventHero
