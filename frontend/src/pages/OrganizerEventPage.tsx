import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import {
    getPublishProblems,
    managedEventKey,
    publishEvent,
    type PublishProblem,
    unpublishEvent,
    useManagedEvent,
    useManagedTicketTypes,
    usePaidSales,
    type ManagedEvent,
} from '../features/organizer/api'
import CancelEventCard from '../features/organizer/components/CancelEventCard'
import EventDetailsCard from '../features/organizer/components/EventDetailsCard'
import EventDetailsForm from '../features/organizer/components/EventDetailsForm'
import ReadinessChecklist from '../features/organizer/components/ReadinessChecklist'
import { getReadiness } from '../features/organizer/readiness'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { getDateParts } from '../shared/lib/date'

type BusyAction = 'publish' | 'unpublish' | null

const OrganizerEventPage = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event, isPending, isError } = useManagedEvent(eventId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !event) return <p className="text-muted">{t.organizerEvent.loadFailed}</p>

    return <EventOverview key={event.id} event={event} />
}

const EventOverview = ({ event }: { event: ManagedEvent }) => {
    const { t } = useLanguage()
    const texts = t.organizerEvent
    const queryClient = useQueryClient()
    const isDraft = event.status === 'DRAFT'
    const { data: ticketTypes = [], isPending: isTicketTypesPending } = useManagedTicketTypes(event.id)
    const { data: paidSales, isPending: isPaidSalesPending } = usePaidSales(isDraft ? event.id : undefined)
    const isReadinessLoading = isTicketTypesPending || isPaidSalesPending
    const [isEditing, setIsEditing] = useState(false)
    const [busy, setBusy] = useState<BusyAction>(null)
    const [error, setError] = useState('')
    const [problems, setProblems] = useState<PublishProblem[]>([])

    const store = (saved: ManagedEvent) => {
        queryClient.setQueryData<ManagedEvent>(managedEventKey(saved.id), (current) => ({ ...current, ...saved }))
        queryClient.invalidateQueries({ queryKey: ['events'] })
    }

    const run = async (action: BusyAction, task: () => Promise<ManagedEvent>) => {
        setBusy(action)
        setError('')
        setProblems([])
        try {
            store(await task())
        } catch (caught) {
            const publishProblems = getPublishProblems(caught)
            const isUnpublishBlocked = action === 'unpublish' && caught instanceof ApiError && caught.status === 409
            setProblems(publishProblems)
            setError(publishProblems.length > 0 ? texts.notReady : isUnpublishBlocked ? texts.unpublishBlocked : texts.actionFailed)
        }
        setBusy(null)
    }

    const publishedDate = event.published_at ? getDateParts(new Date(event.published_at), event.timezone) : null

    return (
        <div className="flex flex-col gap-6">
            <header>
                <p className="text-xs font-bold tracking-widest text-accent uppercase">{event.title}</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.overview}</h1>
                <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted">
                    <span>{publishedDate ? texts.publishedOn(`${publishedDate.day} ${t.dates.monthsGenitive[publishedDate.month]}`) : texts.notPublished}</span>
                    <span className="font-mono">{event.public_id}</span>
                </p>
            </header>

            {event.is_suspended ? (
                <StatusPanel tone="danger" title={texts.suspendedTitle} text={texts.suspendedText} />
            ) : isDraft ? (
                <StatusPanel tone="accent" title={texts.draftTitle} text={texts.draftText}>
                    <Button shape="pill" disabled={busy !== null} onClick={() => run('publish', () => publishEvent(event.id))}>
                        {busy === 'publish' ? texts.publishing : texts.publish}
                    </Button>
                </StatusPanel>
            ) : event.status === 'PUBLISHED' ? (
                <StatusPanel tone="success" title={texts.liveTitle} text={texts.liveText} note={event.tickets_issued ? texts.unpublishBlocked : texts.unpublishText}>
                    <Button
                        variant="secondary"
                        shape="pill"
                        disabled={busy !== null || event.tickets_issued === true}
                        onClick={() => run('unpublish', () => unpublishEvent(event.id))}
                    >
                        {busy === 'unpublish' ? texts.unpublishing : texts.unpublish}
                    </Button>
                </StatusPanel>
            ) : event.status === 'CANCELLED' ? (
                <StatusPanel tone="danger" title={texts.cancelledTitle} text={texts.cancelledText} />
            ) : (
                <StatusPanel tone="neutral" title={texts.completedTitle} text={texts.completedText} />
            )}

            {error && (
                <div role="alert" className="rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-foreground">
                    <p className="font-semibold">{error}</p>
                    {problems.length > 0 && (
                        <ul className="mt-2 list-disc pl-5 text-muted">
                            {problems.map((problem) => (
                                <li key={problem.text}>{(problem.code && texts.problems[problem.code]) || problem.text}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <div className={`grid gap-6 lg:items-start ${isDraft ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}>
                {isDraft &&
                    (isReadinessLoading ? (
                        <div className="h-96 animate-pulse rounded-2xl bg-surface-sunk" />
                    ) : (
                        <ReadinessChecklist checks={getReadiness(event, ticketTypes, paidSales)} />
                    ))}

                {isEditing ? (
                    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
                        <EventDetailsForm
                            event={event}
                            onSaved={(saved) => {
                                store(saved)
                                setIsEditing(false)
                            }}
                            onCancel={() => setIsEditing(false)}
                        />
                    </section>
                ) : (
                    <EventDetailsCard event={event} onEdit={() => setIsEditing(true)} />
                )}
            </div>

            {(isDraft || event.status === 'PUBLISHED') && <CancelEventCard event={event} />}
        </div>
    )
}

const panelTone = {
    accent: 'border-accent/20 bg-accent-soft',
    success: 'border-success/20 bg-success-soft',
    danger: 'border-danger/30 bg-danger-soft',
    neutral: 'border-border bg-surface-sunk',
}

interface StatusPanelProps {
    tone: keyof typeof panelTone
    title: string
    text: string
    note?: string
    children?: ReactNode
}

const StatusPanel = ({ tone, title, text, note, children }: StatusPanelProps) => (
    <div className={`flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${panelTone[tone]}`}>
        <div>
            <p className="font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-sm text-muted">{text}</p>
            {note && <p className="mt-1 text-sm text-muted">{note}</p>}
        </div>
        {children && <div className="shrink-0">{children}</div>}
    </div>
)

export default OrganizerEventPage
