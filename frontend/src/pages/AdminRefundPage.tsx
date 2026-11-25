import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import StatusBadge from '../components/ui/StatusBadge'
import Textarea from '../components/ui/Textarea'
import {
    adminRefundsKey,
    approveAdminRefund,
    lastAttempt,
    MANDATORY_REFUND_SOURCES,
    MAX_SYSTEM_ATTEMPTS,
    refundTabs,
    rejectAdminRefund,
    retryAdminRefund,
    useAdminEvents,
    useAdminRefunds,
    type AdminRefundRequest,
    type RefundTab,
} from '../features/admin/api'
import { attemptBadge, decisionBadge, executionBadge } from '../features/admin/refundBadges'
import { formatDateTime } from '../features/organizer/changes'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'

const TIME_ZONE = 'Asia/Almaty'
const MIN_DECLINE_COMMENT = 3

const pagerButton =
    'flex size-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent'

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
        <dt className="text-sm text-muted">{label}</dt>
        <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
)

const AdminRefundPage = () => {
    const { t } = useLanguage()
    const { requestId } = useParams()
    const [searchParams] = useSearchParams()
    const rawTab = searchParams.get('tab')
    const tab: RefundTab = refundTabs.find((value) => value === rawTab) ?? 'DECISION'
    const { data: requests, isPending, isError } = useAdminRefunds(tab)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    const index = requests?.findIndex((request) => request.id === requestId) ?? -1
    if (isError || !requests || index < 0) return <p className="text-muted">{t.admin.refunds.notFound}</p>

    return <Review key={requests[index].id} request={requests[index]} index={index} all={requests} tab={tab} />
}

interface ReviewProps {
    request: AdminRefundRequest
    index: number
    all: AdminRefundRequest[]
    tab: RefundTab
}

const Review = ({ request, index, all, tab }: ReviewProps) => {
    const { t } = useLanguage()
    const texts = t.admin.refunds
    const queryClient = useQueryClient()
    const { data: events = [] } = useAdminEvents()
    const [comment, setComment] = useState('')
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')

    const eventTitle = events.find((event) => event.id === request.event_id)?.title
    const isMandatory = MANDATORY_REFUND_SOURCES.includes(request.source)
    const decision = decisionBadge[request.status]
    const execution = request.execution_status ? executionBadge[request.execution_status] : null
    const attempt = lastAttempt(request)
    const systemAttempts = request.attempts.filter((item) => item.attempt_actor === 'SYSTEM').length
    const isOpen = request.status === 'APPROVED' && (request.execution_status === 'NOT_STARTED' || request.execution_status === 'IN_PROGRESS')
    const outcomeUnknown = isOpen && attempt?.status === 'UNKNOWN'
    const canRetry = request.execution_status === 'IN_PROGRESS' && attempt?.status === 'FAILED'

    const neighbour = (offset: number) => {
        const target = all[index + offset]
        return target ? `/admin/refunds/${target.id}?tab=${tab}` : null
    }
    const previous = neighbour(-1)
    const next = neighbour(1)

    const run = async (action: () => Promise<unknown>) => {
        setIsBusy(true)
        setError('')
        try {
            await action()
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 409 ? texts.conflict : texts.actionFailed)
        } finally {
            await queryClient.invalidateQueries({ queryKey: adminRefundsKey })
            setIsBusy(false)
        }
    }

    const decline = (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        const text = comment.trim()
        if (text.length < MIN_DECLINE_COMMENT) {
            setError(texts.declineReasonRequired)
            return
        }
        void run(() => rejectAdminRefund(request.id, text))
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between gap-3">
                <Link
                    to="/admin/refunds"
                    className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                    <Icon name="chevron-left" className="size-4" />
                    {texts.allRefunds}
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

            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{isMandatory ? texts.mandatory : texts.voluntary}</p>
                    <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight text-foreground">{request.order_number}</h1>
                    <p className="mt-1 text-sm text-muted">
                        {[eventTitle, texts.sources[request.source], formatKzt(request.amount_minor), texts.requestedAt(formatDateTime(request.created_at, TIME_ZONE, t))]
                            .filter(Boolean)
                            .join(', ')}
                    </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <StatusBadge tone={decision.tone} icon={decision.icon}>
                        {texts.decisionStatus[request.status]}
                    </StatusBadge>
                    {execution && request.execution_status && (
                        <StatusBadge tone={execution.tone} icon={execution.icon}>
                            {texts.executionStatus[request.execution_status]}
                        </StatusBadge>
                    )}
                </div>
            </header>

            {request.status === 'PENDING_ADMIN' && (
                <div className="rounded-2xl bg-badge-warning-bg p-4 text-sm text-badge-warning-fg">
                    <p className="font-semibold">{texts.escalatedTitle}</p>
                    <p className="mt-1">{texts.escalatedText}</p>
                </div>
            )}
            {outcomeUnknown && (
                <div className="rounded-2xl bg-badge-danger-bg p-4 text-sm text-badge-danger-fg">
                    <p className="font-semibold">{texts.unknownTitle}</p>
                    <p className="mt-1">{texts.unknownText}</p>
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
                <div className="flex flex-col gap-6">
                    <section className="rounded-2xl border border-border bg-surface p-6">
                        <h2 className="text-lg font-bold text-foreground">{texts.request}</h2>
                        <dl className="mt-4 flex flex-col gap-3">
                            <Row label={texts.fields.reason}>{t.organizerRefunds.reason(request.reason_code)}</Row>
                            <Row label={texts.fields.comment}>{request.comment ?? '—'}</Row>
                            <Row label={texts.fields.amount}>{texts.wholeOrder(formatKzt(request.amount_minor))}</Row>
                            {request.reviewed_at && <Row label={texts.fields.reviewed}>{formatDateTime(request.reviewed_at, TIME_ZONE, t)}</Row>}
                            {request.execution_finalized_at && (
                                <Row label={texts.fields.finished}>{formatDateTime(request.execution_finalized_at, TIME_ZONE, t)}</Row>
                            )}
                        </dl>
                    </section>

                    {request.attempts.length > 0 && (
                        <section className="rounded-2xl border border-border bg-surface p-6">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <h2 className="text-lg font-bold text-foreground">{texts.attempts}</h2>
                                {isMandatory && <span className="text-sm text-muted">{texts.systemAttempts(systemAttempts, MAX_SYSTEM_ATTEMPTS)}</span>}
                            </div>
                            <div className="mt-4 overflow-x-auto">
                                <table className="w-full min-w-[480px] text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                            <th className="py-2 pr-4 font-semibold">{texts.attemptColumns.attempt}</th>
                                            <th className="py-2 pr-4 font-semibold">{texts.attemptColumns.by}</th>
                                            <th className="py-2 pr-4 font-semibold">{texts.attemptColumns.status}</th>
                                            <th className="py-2 pr-4 font-semibold">{texts.attemptColumns.started}</th>
                                            <th className="py-2 font-semibold">{texts.attemptColumns.finished}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {request.attempts.map((item, position) => (
                                            <tr key={item.id}>
                                                <td className="py-3 pr-4 text-foreground">#{position + 1}</td>
                                                <td className="py-3 pr-4 text-foreground">{texts.actors[item.attempt_actor]}</td>
                                                <td className="py-3 pr-4">
                                                    <StatusBadge tone={attemptBadge[item.status].tone} icon={attemptBadge[item.status].icon}>
                                                        {texts.attemptStatus[item.status]}
                                                    </StatusBadge>
                                                </td>
                                                <td className="py-3 pr-4 whitespace-nowrap text-muted">{formatDateTime(item.created_at, TIME_ZONE, t)}</td>
                                                <td className="py-3 whitespace-nowrap text-muted">{item.finalized_at ? formatDateTime(item.finalized_at, TIME_ZONE, t) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}
                </div>

                <section className="rounded-2xl border border-border bg-surface p-6">
                    <h2 className="text-lg font-bold text-foreground">{request.status === 'PENDING_ADMIN' ? texts.decision : texts.actions}</h2>
                    {request.status === 'PENDING_ADMIN' ? (
                        <form onSubmit={decline} noValidate>
                            <Button type="button" shape="pill" className="mt-4 w-full" disabled={isBusy} onClick={() => run(() => approveAdminRefund(request.id))}>
                                {texts.approve(formatKzt(request.amount_minor))}
                            </Button>
                            <label htmlFor="refund-decline" className="mt-5 block text-sm font-semibold text-foreground">
                                {texts.declineLabel}
                            </label>
                            <Textarea
                                id="refund-decline"
                                rows={3}
                                value={comment}
                                maxLength={2000}
                                onChange={(changeEvent) => setComment(changeEvent.target.value)}
                                className="mt-2 min-h-24"
                            />
                            <Button type="submit" variant="secondary" shape="pill" className="mt-3" disabled={isBusy}>
                                {texts.decline}
                            </Button>
                            <p className="mt-3 text-xs text-muted">{texts.decisionHint}</p>
                        </form>
                    ) : canRetry ? (
                        <>
                            <Button shape="pill" className="mt-4 w-full" disabled={isBusy} onClick={() => run(() => retryAdminRefund(request.id))}>
                                {texts.retry}
                            </Button>
                            <p className="mt-3 text-xs text-muted">{texts.retryHint}</p>
                        </>
                    ) : (
                        <p className="mt-3 text-sm text-muted">{outcomeUnknown ? texts.waitForBank : isOpen ? texts.processing : texts.nothingToDo}</p>
                    )}
                    {isMandatory && isOpen && <p className="mt-3 text-xs text-muted">{texts.mandatoryHint}</p>}
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

export default AdminRefundPage
