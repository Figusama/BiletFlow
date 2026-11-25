import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import StatusBadge from '../components/ui/StatusBadge'
import Textarea from '../components/ui/Textarea'
import {
    adminCancellationsKey,
    approveCancellation,
    cancellationFilters,
    rejectCancellation,
    useAdminCancellationDetail,
    useAdminCancellations,
    useAdminEvents,
    type AdminCancellationDetail,
    type CancellationFilter,
    type RefundHandlingMode,
} from '../features/admin/api'
import { applicationBadge } from '../features/applications/status'
import { formatDateTime } from '../features/organizer/changes'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'

const TIME_ZONE = 'Asia/Almaty'
const MIN_REJECT_COMMENT = 3
const modes: RefundHandlingMode[] = ['AUTOMATIC_FULL', 'ADMIN_REVIEW']

const pagerButton =
    'flex size-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent'

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="grid gap-1 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-4">
        <dt className="text-sm text-muted">{label}</dt>
        <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
)

const AdminCancellationPage = () => {
    const { t } = useLanguage()
    const { requestId } = useParams()
    const [searchParams] = useSearchParams()
    const rawStatus = searchParams.get('status')
    const filter: CancellationFilter = cancellationFilters.find((value) => value === rawStatus) ?? 'PENDING'
    const { data: request, isPending, isError } = useAdminCancellationDetail(requestId)
    const { data: list = [] } = useAdminCancellations(filter)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !request) return <p className="text-muted">{t.admin.cancellations.notFound}</p>

    return <Review key={request.id} request={request} ids={list.map((item) => item.id)} filter={filter} />
}

interface ReviewProps {
    request: AdminCancellationDetail
    ids: string[]
    filter: CancellationFilter
}

const Review = ({ request, ids, filter }: ReviewProps) => {
    const { t } = useLanguage()
    const texts = t.admin.cancellations
    const queryClient = useQueryClient()
    const { data: events = [] } = useAdminEvents()
    const event = events.find((item) => item.id === request.event_id)
    const impact = request.impact
    const [chosenMode, setChosenMode] = useState<RefundHandlingMode | null>(null)
    const mode = chosenMode ?? impact.default_refund_handling_mode
    const [comment, setComment] = useState('')
    const [isConfirming, setIsConfirming] = useState(false)
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')

    const isPending = request.status === 'PENDING'
    const badge = applicationBadge[request.status]
    const index = ids.indexOf(request.id)

    const neighbour = (offset: number) => {
        const target = ids[index + offset]
        return index >= 0 && target ? `/admin/cancellations/${target}?status=${filter}` : null
    }
    const previous = neighbour(-1)
    const next = neighbour(1)

    const run = async (action: () => Promise<unknown>) => {
        setIsBusy(true)
        setError('')
        try {
            await action()
            await queryClient.invalidateQueries({ queryKey: adminCancellationsKey })
            await queryClient.invalidateQueries({ queryKey: ['admin', 'events'] })
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 409 ? texts.alreadyReviewed : caught instanceof ApiError && caught.status === 403 ? texts.forbidden : texts.actionFailed)
            await queryClient.invalidateQueries({ queryKey: adminCancellationsKey })
        } finally {
            setIsBusy(false)
            setIsConfirming(false)
        }
    }

    const reject = (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        const text = comment.trim()
        if (text.length < MIN_REJECT_COMMENT) {
            setError(texts.rejectReasonRequired)
            return
        }
        void run(() => rejectCancellation(request.id, text))
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between gap-3">
                <Link
                    to="/admin/cancellations"
                    className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                    <Icon name="chevron-left" className="size-4" />
                    {texts.allRequests}
                </Link>
                {index >= 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted">
                        <span>{texts.position(index + 1, ids.length)}</span>
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
                )}
            </div>

            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{texts.kicker}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                        {request.event_title} <span className="font-mono text-base font-normal text-muted">{request.event_public_id}</span>
                    </h1>
                    <p className="mt-1 text-sm text-muted">
                        {[
                            request.organizer_name,
                            texts.requestedAt(formatDateTime(request.created_at, TIME_ZONE, t)),
                            event && texts.startsAt(formatDateTime(event.starts_at, TIME_ZONE, t)),
                        ]
                            .filter(Boolean)
                            .join(', ')}
                    </p>
                </div>
                <StatusBadge tone={badge.tone} icon={badge.icon}>
                    {t.admin.applications.status[request.status]}
                </StatusBadge>
            </header>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
                <div className="flex flex-col gap-6">
                    <section className="rounded-2xl border border-border bg-surface p-6">
                        <h2 className="text-lg font-bold text-foreground">{texts.reason}</h2>
                        <p className="mt-3 text-sm whitespace-pre-line text-foreground">{request.reason}</p>
                    </section>
                    <section className="rounded-2xl border border-border bg-surface p-6">
                        <h2 className="text-lg font-bold text-foreground">{texts.affects}</h2>
                        <dl className="mt-4 flex flex-col gap-3">
                            <Row label={texts.fields.tickets}>{texts.ticketsValue(impact.tickets_issued, impact.tickets_valid)}</Row>
                            <Row label={texts.fields.paidOrders}>{texts.paidOrdersValue(impact.paid_orders, formatKzt(impact.paid_amount_minor))}</Row>
                            <Row label={texts.fields.freeTickets}>{impact.free_tickets}</Row>
                            <Row label={texts.fields.refundedOrders}>{impact.refunded_orders}</Row>
                            <Row label={texts.fields.payments}>
                                {impact.payments_in_progress > 0 ? texts.paymentsValue(impact.payments_in_progress) : '0'}
                            </Row>
                            <Row label={texts.fields.changeRequest}>
                                {impact.pending_change_request_number ? texts.changeValue(impact.pending_change_request_number) : '—'}
                            </Row>
                            <Row label={texts.fields.checkIns}>{impact.tickets_checked_in}</Row>
                        </dl>
                        <p className="mt-4 text-xs text-muted">{texts.affectsNote}</p>
                    </section>
                </div>

                <section className="rounded-2xl border border-border bg-surface p-6">
                    <h2 className="text-lg font-bold text-foreground">{texts.decision}</h2>
                    {isPending ? (
                        <form onSubmit={reject} noValidate>
                            <fieldset className="mt-4">
                                <legend className="text-sm font-semibold text-foreground">{texts.refundsIfApproved}</legend>
                                <div className="mt-2 flex flex-col gap-2">
                                    {modes.map((value) => (
                                        <label
                                            key={value}
                                            className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-sm ${mode === value ? 'border-accent bg-accent-soft' : 'border-border'}`}
                                        >
                                            <input type="radio" name="refund-mode" checked={mode === value} onChange={() => setChosenMode(value)} className="mt-0.5 size-4 shrink-0 accent-accent" />
                                            <span>
                                                <span className="block font-semibold text-foreground">{texts.modes[value]}</span>
                                                <span className="mt-0.5 block text-muted">{texts.modeHints[value]}</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>

                            {isConfirming ? (
                                <div className="mt-4 rounded-2xl bg-badge-danger-bg p-4 text-sm text-badge-danger-fg">
                                    <p className="font-semibold">{texts.confirmTitle}</p>
                                    <p className="mt-1">{texts.confirmText}</p>
                                    <div className="mt-3 flex gap-2">
                                        <Button type="button" size="sm" shape="pill" disabled={isBusy} onClick={() => run(() => approveCancellation(request.id, mode))}>
                                            {texts.confirmYes}
                                        </Button>
                                        <Button type="button" size="sm" variant="secondary" shape="pill" disabled={isBusy} onClick={() => setIsConfirming(false)}>
                                            {texts.confirmNo}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <Button type="button" shape="pill" className="mt-4 w-full" disabled={isBusy} onClick={() => setIsConfirming(true)}>
                                    {texts.approveButton}
                                </Button>
                            )}

                            <label htmlFor="cancel-reject" className="mt-5 block text-sm font-semibold text-foreground">
                                {texts.rejectLabel}
                            </label>
                            <Textarea id="cancel-reject" rows={3} value={comment} maxLength={2000} onChange={(changeEvent) => setComment(changeEvent.target.value)} className="mt-2 min-h-24" />
                            <Button type="submit" variant="secondary" shape="pill" className="mt-3" disabled={isBusy}>
                                {texts.rejectButton}
                            </Button>
                        </form>
                    ) : (
                        <div className="mt-2 text-sm text-foreground">
                            {request.reviewed_at && <p className="text-muted">{texts.reviewedAt(formatDateTime(request.reviewed_at, TIME_ZONE, t))}</p>}
                            {request.refund_handling_mode && <p className="mt-2 font-semibold">{texts.modes[request.refund_handling_mode]}</p>}
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
        </div>
    )
}

export default AdminCancellationPage
