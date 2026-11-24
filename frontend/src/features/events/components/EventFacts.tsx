import type { ReactNode } from 'react'
import { useLanguage } from '../../../shared/i18n/language'
import type { EventDetails } from '../api'
import { formatEventTimeRange } from '../labels'

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex items-baseline gap-2">
        <dt className="shrink-0 text-foreground">{label}</dt>
        <span aria-hidden="true" className="min-w-6 flex-1 border-b border-border" />
        <dd className="min-w-0 text-right break-words text-muted">{children}</dd>
    </div>
)

const linkClass = 'hover:text-accent hover:underline'

interface EventFactsProps {
    event: EventDetails
    priceLabel: string | null
}

const EventFacts = ({ event, priceLabel }: EventFactsProps) => {
    const { t } = useLanguage()
    const city = event.venue_city ? (t.city.names[event.venue_city] ?? event.venue_city) : null
    const address = [event.venue_address, city].filter(Boolean).join(', ')
    const { public_contact_name: name, public_contact_email: email, public_contact_phone: phone } = event
    const hasContacts = Boolean(name || email || phone)

    return (
        <section aria-labelledby="details-title">
            <h2 id="details-title" className="text-xl font-bold text-foreground">
                {t.eventPage.details}
            </h2>
            <dl className="mt-4 flex flex-col gap-3">
                <Row label={t.eventPage.dateAndTime}>{formatEventTimeRange(event, t)}</Row>
                {event.venue_name && <Row label={t.eventPage.venue}>{event.venue_name}</Row>}
                {address && <Row label={t.eventPage.address}>{address}</Row>}
                {priceLabel && <Row label={t.discover.price}>{priceLabel}</Row>}
                {name && <Row label={t.eventPage.organizer}>{name}</Row>}
                {email && (
                    <Row label={t.eventPage.email}>
                        <a href={`mailto:${email}`} className={linkClass}>
                            {email}
                        </a>
                    </Row>
                )}
                {phone && (
                    <Row label={t.eventPage.phone}>
                        <a href={`tel:${phone.replace(/\s/g, '')}`} className={linkClass}>
                            {phone}
                        </a>
                    </Row>
                )}
                {!hasContacts && <Row label={t.eventPage.contacts}>{t.eventPage.noContacts}</Row>}
            </dl>
        </section>
    )
}

export default EventFacts
