import type { ReactNode } from 'react'
import Button from '../../../components/ui/Button'
import { useLanguage } from '../../../shared/i18n/language'
import { formatEventTimeRange } from '../../events/labels'
import type { ManagedEvent } from '../api'

const DetailRow = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
        <dt className="text-sm text-muted">{label}</dt>
        <dd className="text-sm font-medium break-words text-foreground">{children}</dd>
    </div>
)

const Lines = ({ values, empty }: { values: (string | null)[]; empty: string }) => {
    const shown = values.filter((value): value is string => Boolean(value))
    if (shown.length === 0) return <span className="font-normal text-muted">{empty}</span>
    return (
        <>
            {shown.map((value) => (
                <span key={value} className="block">
                    {value}
                </span>
            ))}
        </>
    )
}

interface EventDetailsCardProps {
    event: ManagedEvent
    onEdit: () => void
}

const EventDetailsCard = ({ event, onEdit }: EventDetailsCardProps) => {
    const { t } = useLanguage()
    const texts = t.organizerEvent
    const categoryLabels: Record<string, string> = t.categories
    const refundHours = event.refund_policy.self_service_refund_until_hours_before_start
    const canEdit = event.status === 'DRAFT' || event.status === 'PUBLISHED'

    return (
        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-bold text-foreground">{texts.detailsTitle}</h2>
                {canEdit && (
                    <Button variant="secondary" size="sm" shape="pill" onClick={onEdit}>
                        {texts.edit}
                    </Button>
                )}
            </div>

            <p className="mt-5 text-xs font-bold tracking-widest text-muted uppercase">{texts.editable}</p>
            <dl className="mt-1 divide-y divide-border">
                <DetailRow label={texts.fields.description}>
                    <span className="line-clamp-3 font-normal whitespace-pre-line">{event.description}</span>
                </DetailRow>
                <DetailRow label={texts.fields.categories}>
                    <Lines values={event.categories.map((category) => categoryLabels[category.slug] ?? category.name)} empty={texts.notSet} />
                </DetailRow>
                <DetailRow label={texts.fields.contact}>
                    <Lines
                        values={[event.public_contact_name, event.public_contact_email, event.public_contact_phone]}
                        empty={texts.notSet}
                    />
                </DetailRow>
                <DetailRow label={texts.fields.links}>
                    <Lines
                        values={[event.public_instagram_url, event.public_telegram_url, event.public_website_url]}
                        empty={texts.notSet}
                    />
                </DetailRow>
                <DetailRow label={texts.fields.capacity}>
                    {event.seating_mode === 'ASSIGNED_SEATING' ? (
                        texts.capacityBySeats
                    ) : event.ga_capacity ? (
                        texts.capacityValue(event.ga_capacity)
                    ) : (
                        <span className="font-normal text-muted">{texts.notSet}</span>
                    )}
                </DetailRow>
                <DetailRow label={texts.fields.refundPolicy}>
                    {typeof refundHours === 'number' ? texts.refundUntil(refundHours) : texts.refundNone}
                </DetailRow>
            </dl>

            <p className="mt-6 text-xs font-bold tracking-widest text-muted uppercase">{texts.moderated}</p>
            <dl className="mt-1 divide-y divide-border">
                <DetailRow label={texts.fields.title}>{event.title}</DetailRow>
                <DetailRow label={texts.fields.date}>{formatEventTimeRange(event, t)}</DetailRow>
                <DetailRow label={texts.fields.venue}>
                    <Lines values={[event.venue_name, event.venue_address]} empty={texts.notSet} />
                </DetailRow>
                <DetailRow label={texts.fields.seating}>{texts.seating[event.seating_mode]}</DetailRow>
                <DetailRow label={texts.fields.visibility}>{texts.visibility[event.visibility]}</DetailRow>
            </dl>
        </section>
    )
}

export default EventDetailsCard
