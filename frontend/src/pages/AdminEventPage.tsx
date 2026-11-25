import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import StatusBadge from '../components/ui/StatusBadge'
import Textarea from '../components/ui/Textarea'
import { adminEventsKey, restoreEvent, suspendEvent, useAdminEventDetails, useAdminSupportCases, type AdminEvent } from '../features/admin/api'
import { activationBadge } from '../features/admin/activationBadges'
import { eventStatusBadge } from '../features/admin/eventBadges'
import { formatDateTime } from '../features/organizer/changes'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'

const TIME_ZONE = 'Asia/Almaty'
const MIN_REASON = 3

const AdminEventPage = () => {
    const { t } = useLanguage()
    const { publicId } = useParams()
    const { data: event, isPending, isError } = useAdminEventDetails(publicId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !event) return <p className="text-muted">{t.admin.events.notFound}</p>

    return <Details key={event.id} event={event} />
}

const Details = ({ event }: { event: AdminEvent }) => {
    const { t } = useLanguage()
    const texts = t.admin.events
    const queryClient = useQueryClient()
    const { data: supportCases = [] } = useAdminSupportCases('', 'ALL', event.id)
    const [reason, setReason] = useState('')
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')

    const badge = eventStatusBadge[event.status]
    const isClosed = event.status === 'CANCELLED' || event.status === 'COMPLETED'
    const paidSalesBadge = activationBadge[event.paid_sales_status]
    const eventCases = supportCases.filter((item) => item.status !== 'RESOLVED')
    const escalated = eventCases.filter((item) => item.escalated_to_platform).length

    const run = async (action: () => Promise<unknown>) => {
        setIsBusy(true)
        setError('')
        try {
            await action()
            await queryClient.invalidateQueries({ queryKey: adminEventsKey })
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 409 ? texts.conflict : texts.actionFailed)
        } finally {
            setIsBusy(false)
        }
    }

    const suspend = (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        const text = reason.trim()
        if (text.length < MIN_REASON) {
            setError(texts.reasonRequired)
            return
        }
        void run(() => suspendEvent(event.id, text))
    }

    return (
        <div className="flex flex-col gap-6">
            <Link
                to="/admin/events"
                className="inline-flex items-center gap-1 self-start text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
                <Icon name="chevron-left" className="size-4" />
                {texts.allEvents}
            </Link>

            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{texts.kicker}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                        {event.title} <span className="font-mono text-base font-normal text-muted">{event.public_id}</span>
                    </h1>
                    <p className="mt-1 text-sm text-muted">{texts.startsAt(formatDateTime(event.starts_at, TIME_ZONE, t))}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge tone={badge.tone} icon={badge.icon}>
                        {t.organizerEvent.status[event.status]}
                    </StatusBadge>
                    {event.is_suspended && (
                        <StatusBadge tone="danger" icon="ban">
                            {texts.suspended}
                        </StatusBadge>
                    )}
                </div>
            </header>

            <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                <section className="rounded-2xl border border-border bg-surface p-6">
                    <h2 className="text-lg font-bold text-foreground">{texts.glance}</h2>
                    <dl className="mt-4 flex flex-col gap-3 text-sm">
                        <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
                            <dt className="text-muted">{texts.fields.venue}</dt>
                            <dd className="font-medium text-foreground">
                                {event.venue_name}, {event.city}
                            </dd>
                        </div>
                        <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
                            <dt className="text-muted">{texts.fields.visibility}</dt>
                            <dd className="font-medium text-foreground">{t.organizerEvent.visibility[event.visibility]}</dd>
                        </div>
                        <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
                            <dt className="text-muted">{texts.fields.sold}</dt>
                            <dd className="font-medium text-foreground">{texts.soldValue(event.tickets_sold, event.capacity)}</dd>
                        </div>
                        <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
                            <dt className="text-muted">{texts.fields.tickets}</dt>
                            <dd className="font-medium text-foreground">{event.tickets_issued}</dd>
                        </div>
                        <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
                            <dt className="text-muted">{texts.fields.paidSales}</dt>
                            <dd>
                                <Link to={`/admin/paid-sales/events/${event.id}`} className="inline-flex focus-visible:outline-2 focus-visible:outline-accent">
                                    <StatusBadge tone={paidSalesBadge.tone} icon={paidSalesBadge.icon}>
                                        {t.admin.activations.activationStatus[event.paid_sales_status]}
                                    </StatusBadge>
                                </Link>
                            </dd>
                        </div>
                        <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
                            <dt className="text-muted">{texts.fields.support}</dt>
                            <dd className="font-medium text-foreground">{texts.supportValue(eventCases.length, escalated)}</dd>
                        </div>
                        <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
                            <dt className="text-muted">{texts.fields.organizer}</dt>
                            <dd className="font-medium text-foreground">
                                {event.organizer_name ?? event.organizer_email ?? '—'}
                                {event.organizer_name && event.organizer_email && <span className="block text-xs font-normal text-muted">{event.organizer_email}</span>}
                            </dd>
                        </div>
                    </dl>
                    <div className="mt-5 flex flex-wrap gap-4 text-sm">
                        {event.status !== 'DRAFT' && (
                            <Link to={`/events/${event.id}`} className="font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
                                {texts.openPublic}
                            </Link>
                        )}
                        <Link to={`/admin/audit?event=${event.id}`} className="font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
                            {texts.history}
                        </Link>
                    </div>
                </section>

                <section className="rounded-2xl border border-border bg-surface p-6">
                    <h2 className="text-lg font-bold text-foreground">{event.is_suspended ? texts.suspension : texts.suspendTitle}</h2>
                    {event.is_suspended ? (
                        <>
                            <div className="mt-4 rounded-2xl bg-badge-danger-bg p-4 text-sm text-badge-danger-fg">
                                {event.suspended_at && (
                                    <p className="font-semibold">
                                        {texts.suspendedAt(formatDateTime(event.suspended_at, TIME_ZONE, t))}
                                        {event.suspended_by_name && `, ${texts.suspendedBy(event.suspended_by_name)}`}
                                    </p>
                                )}
                                {event.suspension_reason && <p className="mt-1 whitespace-pre-line">{event.suspension_reason}</p>}
                            </div>
                            <p className="mt-3 text-sm text-muted">{texts.restoreHint}</p>
                            <Button className="mt-4" shape="pill" disabled={isBusy} onClick={() => run(() => restoreEvent(event.id))}>
                                {texts.lift}
                            </Button>
                        </>
                    ) : isClosed ? (
                        <p className="mt-3 text-sm text-muted">{texts.closed}</p>
                    ) : (
                        <form onSubmit={suspend} noValidate>
                            <label htmlFor="suspend-reason" className="mt-4 block text-sm font-semibold text-foreground">
                                {texts.reasonLabel}
                            </label>
                            <Textarea
                                id="suspend-reason"
                                rows={3}
                                value={reason}
                                maxLength={500}
                                onChange={(changeEvent) => setReason(changeEvent.target.value)}
                                className="mt-2 min-h-24"
                            />
                            <ul className="mt-4 flex flex-col gap-2 text-sm text-foreground">
                                {texts.effects.map((effect) => (
                                    <li key={effect} className="flex items-start gap-2">
                                        <Icon name="clock" className="mt-0.5 size-4 shrink-0 text-muted" />
                                        {effect}
                                    </li>
                                ))}
                            </ul>
                            <Button type="submit" shape="pill" className="mt-5" disabled={isBusy}>
                                {texts.suspend}
                            </Button>
                        </form>
                    )}
                    {error && (
                        <p role="alert" className="mt-3 text-sm text-error">
                            {error}
                        </p>
                    )}
                </section>
            </div>
        </div>
    )
}

export default AdminEventPage
