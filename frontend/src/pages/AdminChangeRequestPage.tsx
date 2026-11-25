import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import StatusBadge from '../components/ui/StatusBadge'
import Textarea from '../components/ui/Textarea'
import {
    adminChangesKey,
    approveChangeRequest,
    changeReviewStatuses,
    rejectChangeRequest,
    useAdminChangeRequests,
    useAdminEvents,
    type AdminChangeRequest,
    type ChangeReviewStatus,
} from '../features/admin/api'
import { useVenues } from '../features/applications/api'
import { applicationBadge } from '../features/applications/status'
import { formatChangeValue, formatDateTime, ticketTypeName } from '../features/organizer/changes'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { useTicketTypes } from '../features/tickets/api'

const TIME_ZONE = 'Asia/Almaty'
const MIN_REJECT_COMMENT = 3
const TERMS_FIELDS = ['STARTS_AT', 'ENDS_AT', 'VENUE', 'VENUE_LAYOUT', 'REFUND_POLICY']
const REFUND_WINDOW_FIELDS = ['STARTS_AT', 'VENUE']

const pagerButton =
    'flex size-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'

const AdminChangeRequestPage = () => {
    const { t } = useLanguage()
    const { requestId } = useParams()
    const [searchParams] = useSearchParams()
    const rawStatus = searchParams.get('status')
    const status: ChangeReviewStatus = changeReviewStatuses.find((value) => value === rawStatus) ?? 'PENDING'
    const { data: requests, isPending, isError } = useAdminChangeRequests(status)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    const index = requests?.findIndex((request) => request.id === requestId) ?? -1
    if (isError || !requests || index < 0) return <p className="text-muted">{t.admin.changes.notFound}</p>

    return <Review key={requests[index].id} request={requests[index]} index={index} all={requests} status={status} />
}

interface ReviewProps {
    request: AdminChangeRequest
    index: number
    all: AdminChangeRequest[]
    status: ChangeReviewStatus
}

const Review = ({ request, index, all, status }: ReviewProps) => {
    const { t } = useLanguage()
    const texts = t.admin.changes
    const queryClient = useQueryClient()
    const { data: events = [] } = useAdminEvents()
    const { data: venues = [] } = useVenues()
    const { data: ticketTypes = [] } = useTicketTypes(request.event_id)
    const [comment, setComment] = useState('')
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')

    const event = events.find((item) => item.id === request.event_id)
    const isPending = request.status === 'PENDING'
    const badge = applicationBadge[request.status === 'DRAFT' ? 'DRAFT' : request.status]
    const fields = request.items.map((item) => item.field)
    const touches = (list: string[]) => fields.some((field) => list.includes(field))
    const holders = event?.tickets_issued ?? 0

    const checks = [
        touches(TERMS_FIELDS) && texts.checkTerms,
        touches(REFUND_WINDOW_FIELDS) && texts.checkRefundWindow,
        holders > 0 && (touches(TERMS_FIELDS) || fields.includes('TITLE')) && texts.checkHolders(holders),
    ].filter((text): text is string => Boolean(text))

    const neighbour = (offset: number) => {
        const target = all[index + offset]
        return target ? `/admin/change-requests/${target.id}?status=${status}` : null
    }
    const previous = neighbour(-1)
    const next = neighbour(1)

    const run = async (action: () => Promise<AdminChangeRequest>) => {
        setIsBusy(true)
        setError('')
        try {
            await action()
            await queryClient.invalidateQueries({ queryKey: adminChangesKey })
            await queryClient.invalidateQueries({ queryKey: ['admin', 'events'] })
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 403) setError(texts.ownRequest)
            else if (caught instanceof ApiError && caught.status === 409) setError(texts.alreadyReviewed)
            else setError(texts.actionFailed)
            await queryClient.invalidateQueries({ queryKey: adminChangesKey })
        } finally {
            setIsBusy(false)
        }
    }

    const reject = (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        const text = comment.trim()
        if (text.length < MIN_REJECT_COMMENT) {
            setError(texts.rejectReasonRequired)
            return
        }
        void run(() => rejectChangeRequest(request.id, text))
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between gap-3">
                <Link
                    to="/admin/change-requests"
                    className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                    <Icon name="chevron-left" className="size-4" />
                    {texts.allRequests}
                </Link>
                <div className="flex items-center gap-2 text-sm text-muted">
                    <span>{texts.position(index + 1, all.length)}</span>
                    {previous ? (
                        <Link to={previous} aria-label={texts.previous} className={pagerButton}>
                            <Icon name="chevron-left" className="size-4" />
                        </Link>
                    ) : (
                        <span aria-hidden className={`${pagerButton} opacity-40`}>
                            <Icon name="chevron-left" className="size-4" />
                        </span>
                    )}
                    {next ? (
                        <Link to={next} aria-label={texts.next} className={pagerButton}>
                            <Icon name="chevron-left" className="size-4 rotate-180" />
                        </Link>
                    ) : (
                        <span aria-hidden className={`${pagerButton} opacity-40`}>
                            <Icon name="chevron-left" className="size-4 rotate-180" />
                        </span>
                    )}
                </div>
            </div>

            <article className="rounded-2xl border border-border bg-surface p-6">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <StatusBadge tone={badge.tone} icon={badge.icon}>
                        {t.organizerChanges.status[request.status]}
                    </StatusBadge>
                    <span className="font-mono text-xs text-muted">{request.request_number}</span>
                </div>
                <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">{event?.title ?? '—'}</h1>
                <p className="mt-1 text-sm text-muted">
                    {[
                        event?.organizer_email && texts.requestedBy(event.organizer_email),
                        request.submitted_at && formatDateTime(request.submitted_at, TIME_ZONE, t),
                        event && t.organizerEvent.status[event.status],
                        event && texts.ticketsIssued(event.tickets_issued),
                    ]
                        .filter(Boolean)
                        .join(', ')}
                </p>

                {request.comment && (
                    <section className="mt-6 rounded-2xl bg-surface-sunk p-5">
                        <h2 className="text-sm font-semibold text-foreground">{texts.organizerComment}</h2>
                        <p className="mt-2 text-sm whitespace-pre-line text-foreground">{request.comment}</p>
                    </section>
                )}

                <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
                    <table className="w-full min-w-[560px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.diff.field}</th>
                                <th className="px-5 py-3 font-semibold">{texts.diff.current}</th>
                                <th className="px-5 py-3 font-semibold">{texts.diff.proposed}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {request.items.map((item) => (
                                <tr key={item.id} className="align-top">
                                    <td className="px-5 py-3 font-semibold text-foreground">
                                        {t.organizerChanges.fields[item.field]}
                                        {item.target_id && <span className="block font-normal text-muted">{ticketTypeName(ticketTypes, item.target_id)}</span>}
                                    </td>
                                    <td className="px-5 py-3 text-muted line-through">
                                        {formatChangeValue(item.field, item.old_value, { t, timeZone: TIME_ZONE, venues })}
                                    </td>
                                    <td className="px-5 py-3 font-semibold text-foreground">
                                        {formatChangeValue(item.field, item.new_value, { t, timeZone: TIME_ZONE, venues })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-6 grid gap-6 md:grid-cols-2">
                    <section>
                        <h2 className="text-lg font-bold text-foreground">{texts.checks}</h2>
                        {checks.length === 0 ? (
                            <p className="mt-3 text-sm text-muted">{texts.noChecks}</p>
                        ) : (
                            <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground">
                                {checks.map((text) => (
                                    <li key={text} className="flex items-start gap-2">
                                        <Icon name="clock" className="mt-0.5 size-4 shrink-0 text-muted" />
                                        {text}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-foreground">{texts.decision}</h2>
                        {isPending ? (
                            <form onSubmit={reject} noValidate>
                                <p className="mt-1 text-sm text-muted">{texts.decisionHint}</p>
                                <label htmlFor="change-comment" className="sr-only">
                                    {texts.commentPlaceholder}
                                </label>
                                <Textarea
                                    id="change-comment"
                                    rows={3}
                                    value={comment}
                                    maxLength={2000}
                                    placeholder={texts.commentPlaceholder}
                                    onChange={(changeEvent) => setComment(changeEvent.target.value)}
                                    className="mt-3 min-h-24"
                                />
                                <div className="mt-3 flex flex-wrap gap-3">
                                    <Button
                                        type="button"
                                        shape="pill"
                                        disabled={isBusy}
                                        onClick={() => run(() => approveChangeRequest(request.id, comment.trim() || null))}
                                    >
                                        {texts.approveButton}
                                    </Button>
                                    <Button type="submit" variant="secondary" shape="pill" disabled={isBusy}>
                                        {texts.rejectButton}
                                    </Button>
                                </div>
                            </form>
                        ) : (
                            <div className="mt-2 text-sm text-foreground">
                                {request.reviewed_at && <p className="text-muted">{texts.reviewedAt(formatDateTime(request.reviewed_at, TIME_ZONE, t))}</p>}
                                {request.review_comment && <p className="mt-2 whitespace-pre-line">{request.review_comment}</p>}
                            </div>
                        )}
                        {error && (
                            <p role="alert" className="mt-3 text-sm text-error">
                                {error}
                            </p>
                        )}
                    </section>
                </div>
            </article>
        </div>
    )
}

export default AdminChangeRequestPage
