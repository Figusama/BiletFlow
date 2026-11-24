import { Link } from 'react-router-dom'
import { formatTime, getDateParts } from '../../../shared/lib/date'
import { useLanguage } from '../../../shared/i18n/language'
import type { EventSummary } from '../api'
import { getCategoryLabel, getPriceLabel } from '../labels'
import { ChevronIcon } from '../../../components/ui/icons'
import EventImage from './EventImage'

interface EventListItemProps {
    event: EventSummary
}

const notchClass = 'absolute -right-2 h-2 w-4 border-border bg-background'

const EventListItem = ({ event }: EventListItemProps) => {
    const { t } = useLanguage()
    const startsAt = new Date(event.starts_at)
    const { day, month, weekday } = getDateParts(startsAt, event.timezone)
    const category = getCategoryLabel(event, t)
    const price = getPriceLabel(event, t)

    return (
        <Link
            to={`/events/${event.slug}`}
            className="group flex min-h-[136px] items-stretch rounded-2xl border border-border bg-surface transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
            <div className="relative flex w-28 shrink-0 flex-col justify-center border-r border-dashed border-perforation pr-2 pl-4 sm:w-[140px] sm:pl-6">
                <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[28px] leading-none font-bold text-accent">{day}</span>
                    <span className="text-sm font-bold text-foreground uppercase">
                        {t.dates.weekdaysShort[weekday]}
                    </span>
                </span>
                <span className="mt-2 text-xs font-bold tracking-wide break-words text-muted uppercase">
                    {t.dates.monthsGenitive[month]}
                </span>

                <span aria-hidden="true" className={`${notchClass} -top-px rounded-b-full border border-t-0`} />
                <span aria-hidden="true" className={`${notchClass} -bottom-px rounded-t-full border border-b-0`} />
            </div>

            <EventImage
                src={event.images?.[0]}
                className="my-4 ml-5 hidden h-26 w-44 shrink-0 rounded-xl sm:block"
            />

            <div className="flex min-w-0 flex-1 flex-col justify-center px-6 py-5">
                {category && (
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{category}</p>
                )}
                <h3 className="mt-1 text-base font-bold text-foreground sm:text-lg">{event.title}</h3>
                <p className="mt-1 text-sm text-muted">
                    {formatTime(startsAt, event.timezone)}
                    {event.venue_name && ` / ${event.venue_name}`}
                </p>
                {price && <p className="mt-2 text-sm font-bold text-foreground md:hidden">{price}</p>}
            </div>

            {price && (
                <p className="hidden shrink-0 pt-7 pr-6 text-base font-bold whitespace-nowrap text-foreground md:block">
                    {price}
                </p>
            )}

            <div className="hidden w-[72px] shrink-0 place-items-center border-l border-border text-accent md:my-4 md:grid">
                <ChevronIcon className="size-6 rotate-180 transition-transform group-hover:translate-x-1" />
            </div>
        </Link>
    )
}

export default EventListItem
