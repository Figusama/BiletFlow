import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import StatusBadge, { type BadgeIcon, type BadgeTone } from '../components/ui/StatusBadge'
import { useVenues } from '../features/applications/api'
import {
    changeRequestsKey,
    deleteChangeRequest,
    managedEventKey,
    submitChangeRequest,
    useChangeRequests,
    useManagedEvent,
    useManagedTicketTypes,
    withdrawChangeRequest,
    type ChangeRequest,
    type ChangeRequestStatus,
    type ManagedEvent,
} from '../features/organizer/api'
import { formatChangeValue, formatDateTime, ticketTypeName } from '../features/organizer/changes'
import ChangeRequestForm from '../features/organizer/components/ChangeRequestForm'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'

const statusBadge: Record<ChangeRequestStatus, { tone: BadgeTone; icon?: BadgeIcon }> = {
    DRAFT: { tone: 'neutral' },
    PENDING: { tone: 'warning', icon: 'clock' },
    APPROVED: { tone: 'success', icon: 'check-circle' },
    REJECTED: { tone: 'danger', icon: 'x-circle' },
    WITHDRAWN: { tone: 'neutral', icon: 'ban' },
}

const OrganizerChangeRequestsPage = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event, isPending, isError } = useManagedEvent(eventId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !event) return <p className="text-muted">{t.organizerEvent.loadFailed}</p>

    return <ChangeRequests key={event.id} event={event} />
}

const ChangeRequests = ({ event }: { event: ManagedEvent }) => {
    const { t } = useLanguage()
    const texts = t.organizerChanges
    const queryClient = useQueryClient()
    const { data: requests = [], isPending, isError } = useChangeRequests(event.id)
    const { data: ticketTypes = [] } = useManagedTicketTypes(event.id)
    const { data: venues = [] } = useVenues()
    const [isCreating, setIsCreating] = useState(false)
    const [busyId, setBusyId] = useState<string | null>(null)
    const [error, setError] = useState('')

    const isClosed = event.status === 'CANCELLED' || event.status === 'COMPLETED'

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: changeRequestsKey(event.id) })
        queryClient.invalidateQueries({ queryKey: managedEventKey(event.id) })
    }

    const run = async (request: ChangeRequest, task: () => Promise<unknown>) => {
        setBusyId(request.id)
        setError('')
        try {
            await task()
            refresh()
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 409 && request.status === 'DRAFT' ? texts.oneAtATime : texts.actionFailed)
        }
        setBusyId(null)
    }

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{event.title}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                    <p className="mt-1 max-w-2xl text-sm text-muted">{texts.intro}</p>
                </div>
                {!isClosed && !isCreating && (
                    <Button shape="pill" onClick={() => setIsCreating(true)}>
                        <Icon name="plus" className="mr-2 size-4" />
                        {texts.new}
                    </Button>
                )}
            </header>

            {isCreating && (
                <ChangeRequestForm
                    event={event}
                    ticketTypes={ticketTypes}
                    onDone={(saved, message) => {
                        setIsCreating(false)
                        setError(message ?? '')
                        if (saved) refresh()
                    }}
                />
            )}

            {error && (
                <p role="alert" className="text-sm text-error">
                    {error}
                </p>
            )}

            {isPending ? (
                <div className="h-40 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : requests.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty}</p>
            ) : (
                <ul className="flex flex-col gap-3">
                    {requests.map((request) => {
                        const badge = statusBadge[request.status]
                        const isBusy = busyId !== null
                        return (
                            <li key={request.id} className="rounded-2xl border border-border bg-surface p-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-bold tracking-widest text-muted uppercase">{request.request_number}</p>
                                        <p className="mt-1 text-sm text-muted">
                                            {request.submitted_at
                                                ? texts.submittedOn(formatDateTime(request.submitted_at, event.timezone, t))
                                                : texts.createdOn(formatDateTime(request.created_at, event.timezone, t))}
                                        </p>
                                    </div>
                                    <StatusBadge tone={badge.tone} icon={badge.icon}>
                                        {texts.status[request.status]}
                                    </StatusBadge>
                                </div>

                                <ul className="mt-4 divide-y divide-border border-t border-border">
                                    {request.items.map((item) => (
                                        <li key={item.id} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-4">
                                            <span className="text-muted">
                                                {texts.fields[item.field]}
                                                {item.target_id && <span className="block text-foreground">{ticketTypeName(ticketTypes, item.target_id)}</span>}
                                            </span>
                                            <span className="text-foreground">
                                                <span className="text-muted line-through">{formatChangeValue(item.field, item.old_value, { t, timeZone: event.timezone, venues })}</span>
                                                <Icon name="chevron-left" className="mx-2 inline-block size-3.5 rotate-180 text-muted" />
                                                <span className="font-semibold">{formatChangeValue(item.field, item.new_value, { t, timeZone: event.timezone, venues })}</span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>

                                {request.comment && <p className="mt-3 text-sm text-muted">{request.comment}</p>}
                                {request.review_comment && <p className="mt-2 text-sm text-foreground">{texts.reviewComment(request.review_comment)}</p>}

                                {(request.status === 'DRAFT' || request.status === 'PENDING') && !isClosed && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {request.status === 'DRAFT' ? (
                                            <>
                                                <Button size="sm" shape="pill" disabled={isBusy} onClick={() => run(request, () => submitChangeRequest(request.id))}>
                                                    {texts.submit}
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    shape="pill"
                                                    disabled={isBusy}
                                                    onClick={() => run(request, () => deleteChangeRequest(request.id))}
                                                >
                                                    {texts.delete}
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                shape="pill"
                                                disabled={isBusy}
                                                onClick={() => run(request, () => withdrawChangeRequest(request.id))}
                                            >
                                                {texts.withdraw}
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}

export default OrganizerChangeRequestsPage
