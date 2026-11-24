import { useRef, useState, type TouchEvent } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../../shared/i18n/language'
import type { EventSummary } from '../api'
import { formatEventDate, getCategoryLabel, getPriceLabel } from '../labels'
import { ChevronIcon } from '../../../components/ui/icons'
import EventBanner from './EventBanner'

interface EventHeroProps {
    events: EventSummary[]
}

const SWIPE_DISTANCE = 50

const arrowClass =
    'absolute top-1/2 z-10 hidden h-20 w-7 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-night-deep/60 text-white backdrop-blur hover:bg-night-deep/80 focus-visible:outline-2 focus-visible:outline-accent md:grid'

const EventHero = ({ events }: EventHeroProps) => {
    const { t } = useLanguage()
    const [index, setIndex] = useState(0)
    const touchStartX = useRef<number | null>(null)

    if (events.length === 0) return null

    const event = events[index % events.length]
    const goTo = (next: number) => setIndex((next + events.length) % events.length)

    const handleTouchStart = (touch: TouchEvent) => {
        touchStartX.current = touch.touches[0].clientX
    }

    const handleTouchEnd = (touch: TouchEvent) => {
        if (touchStartX.current === null) return

        const distance = touch.changedTouches[0].clientX - touchStartX.current
        touchStartX.current = null

        if (Math.abs(distance) < SWIPE_DISTANCE) return
        goTo(distance < 0 ? index + 1 : index - 1)
    }

    return (
        <section aria-roledescription="carousel" aria-label={t.discover.title} className="relative">
            <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} className="relative touch-pan-y">
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
                        <ChevronIcon className="h-8 w-4" />
                    </button>
                    <button
                        type="button"
                        aria-label={t.discover.next}
                        onClick={() => goTo(index + 1)}
                        className={`${arrowClass} -right-4`}
                    >
                        <ChevronIcon className="h-8 w-4 rotate-180" />
                    </button>
                </>
            )}
        </section>
    )
}

export default EventHero
