import { Link } from 'react-router-dom'
import { formatTime } from '../../../shared/lib/date'
import { useLanguage } from '../../../shared/i18n/language'
import type { EventSummary } from '../api'
import { getCategoryLabel, getPriceLabel } from '../labels'
import DateStub from './DateStub'
import EventImage from './EventImage'
import Icon from '../../../components/ui/Icon'

interface EventListItemProps {
    event: EventSummary
}

const EventListItem = ({ event }: EventListItemProps) => {
    const { t } = useLanguage()
    const startsAt = new Date(event.starts_at)
    const category = getCategoryLabel(event, t)
    const price = getPriceLabel(event, t)

    return (
        <Link
            to={`/events/${event.slug}`}
            className="group flex min-h-[136px] items-stretch rounded-2xl border border-border bg-surface transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
            <DateStub date={startsAt} timeZone={event.timezone} />

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
                <Icon name="chevron-left" className="size-6 rotate-180 transition-transform group-hover:translate-x-1" />
            </div>
        </Link>
    )
}

export default EventListItem
