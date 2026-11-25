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
    checkRefundStatus,
    lastAttempt,
    MANDATORY_REFUND_SOURCES,
    MAX_SYSTEM_ATTEMPTS,
    refundTabs,
    rejectAdminRefund,
    retryAdminRefund,
    useAdminRefundDetail,
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
    const { data: request, isPending, isError } = useAdminRefundDetail(requestId)
    const { data: list = [] } = useAdminRefunds(tab)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !request) return <p className="text-muted">{t.admin.refunds.notFound}</p>

    return <Review key={request.id} request={request} ids={list.map((item) => item.id)} tab={tab} />
}

interface ReviewProps {
    request: AdminRefundRequest
    ids: string[]
    tab: RefundTab
}

const Review = ({ request, ids, tab }: ReviewProps) => {
    const { t } = useLanguage()
    const texts = t.admin.refunds
    const queryClient = useQueryClient()
    const [now] = useState(() => Date.now())
    const [comment, setComment] = useState('')
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')

    const isMandatory = MANDATORY_REFUND_SOURCES.includes(request.source)
    const decision = decisionBadge[request.status]
    const execution = request.execution_status ? executionBadge[request.execution_status] : null
    const attempt = lastAttempt(request)
    const systemAttempts = request.attempts.filter((item) => item.attempt_actor === 'SYSTEM').length
    const isOpen = request.status === 'APPROVED' && (request.execution_status === 'NOT_STARTED' || request.execution_status === 'IN_PROGRESS')
    const unresolved = isOpen && (attempt?.status === 'UNKNOWN' || attempt?.status === 'PROCESSING')
    const canRetry = request.execution_status === 'IN_PROGRESS' && attempt?.status === 'FAILED'
    const index = ids.indexOf(request.id)

    const neighbour = (offset: number) => {
        const target = ids[index + offset]
        return index >= 0 && target ? `/admin/refunds/${target}?tab=${tab}` : null
    }
    const previous = neighbour(-1)
    const next = neighbour(1)

    const history = [
        { at: request.created_at, label: request.source === 'CUSTOMER' ? texts.history.requested : texts.history.started },
        ...(request.reminder_at && new Date(request.reminder_at).getTime() <= now && request.status !== 'WITHDRAWN' && (request.reviewed_at === null || new Date(request.reminder_at) < new Date(request.reviewed_at))
            ? [{ at: request.reminder_at, label: texts.history.reminder }]
            : []),
        ...(request.escalated_at ? [{ at: request.escalated_at, label: texts.history.escalated }] : []),
        ...(request.reviewed_at ? [{ at: request.reviewed_at, label: request.status === 'REJECTED' ? texts.history.declined : texts.history.approved }] : []),
        ...(request.execution_finalized_at ? [{ at: request.execution_finalized_at, label: texts.history.finished }] : []),
    ].sort((first, second) => new Date(first.at).getTime() - new Date(second.at).getTime())

    const run = async (action: () => Promise<AdminRefundRequest>, successMessage?: string) => {
        setIsBusy(true)
        setError('')
        setMessage('')
        try {
            const updated = await action()
            queryClient.setQueryData([...adminRefundsKey, 'detail', request.id], updated)
            if (successMessage) setMessage(successMessage)
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 409 ? caught.message || texts.conflict : texts.actionFailed)
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

    const policyText = request.refund_deadline ? texts.policyUntil(formatDateTime(request.refund_deadline, TIME_ZONE, t)) : texts.policyNone

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
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{isMandatory ? texts.mandatory : request.status === 'PENDING_ADMIN' ? texts.escalated : texts.voluntary}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                        <span className="font-mono">{request.request_number}</span> <span className="font-mono text-base font-normal text-muted">{request.order_number}</span>
                    </h1>
                    <p className="mt-1 text-sm text-muted">
                        {[request.event_title, texts.buyerLabel(request.buyer_name ?? request.buyer_email), texts.sources[request.source], formatKzt(request.amount_minor), texts.requestedAt(formatDateTime(request.created_at, TIME_ZONE, t))].join(', ')}
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
            {unresolved && attempt?.status === 'UNKNOWN' && (
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
                            <Row label={texts.fields.policy}>{policyText}</Row>
                            <Row label={texts.fields.checkIns}>{request.tickets_checked_in === 0 ? texts.none : texts.checkInsValue(request.tickets_checked_in, request.tickets_total)}</Row>
                            {request.execution_finalized_at && <Row label={texts.fields.finished}>{formatDateTime(request.execution_finalized_at, TIME_ZONE, t)}</Row>}
                        </dl>
                    </section>

                    <section className="rounded-2xl border border-border bg-surface p-6">
                        <h2 className="text-lg font-bold text-foreground">{texts.historyTitle}</h2>
                        <ol className="mt-4 flex flex-col gap-4">
                            {history.map((entry) => (
                                <li key={`${entry.label}-${entry.at}`} className="flex gap-3">
                                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-hidden />
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">{entry.label}</p>
                                        <p className="text-xs text-muted">{formatDateTime(entry.at, TIME_ZONE, t)}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </section>

                    {request.attempts.length > 0 && (
                        <section className="rounded-2xl border border-border bg-surface p-6">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <h2 className="text-lg font-bold text-foreground">{texts.attempts}</h2>
                                {isMandatory && <span className="text-sm text-muted">{texts.systemAttempts(systemAttempts, MAX_SYSTEM_ATTEMPTS)}</span>}
                            </div>
                            <div className="mt-4 overflow-x-auto">
                                <table className="w-full min-w-[560px] text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                            <th className="py-2 pr-4 font-semibold">{texts.attemptColumns.attempt}</th>
                                            <th className="py-2 pr-4 font-semibold">{texts.attemptColumns.by}</th>
                                            <th className="py-2 pr-4 font-semibold">{texts.attemptColumns.status}</th>
                                            <th className="py-2 pr-4 font-semibold">{texts.attemptColumns.started}</th>
                                            <th className="py-2 font-semibold">{texts.attemptColumns.details}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {request.attempts.map((item, position) => (
                                            <tr key={item.id} className="align-top">
                                                <td className="py-3 pr-4 text-foreground">#{position + 1}</td>
                                                <td className="py-3 pr-4 text-foreground">{texts.actors[item.attempt_actor]}</td>
                                                <td className="py-3 pr-4">
                                                    <StatusBadge tone={attemptBadge[item.status].tone} icon={attemptBadge[item.status].icon}>
                                                        {texts.attemptStatus[item.status]}
                                                    </StatusBadge>
                                                </td>
                                                <td className="py-3 pr-4 whitespace-nowrap text-muted">{formatDateTime(item.created_at, TIME_ZONE, t)}</td>
                                                <td className="py-3 text-muted">
                                                    {item.failure_reason && <p>{texts.failureReasons[item.failure_reason]}</p>}
                                                    {item.next_check_at && <p>{texts.nextCheck(formatDateTime(item.next_check_at, TIME_ZONE, t))}</p>}
                                                    {item.next_retry_at && <p>{texts.nextRetry(formatDateTime(item.next_retry_at, TIME_ZONE, t))}</p>}
                                                    {!item.failure_reason && !item.next_check_at && !item.next_retry_at && '—'}
                                                </td>
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
                            <Textarea id="refund-decline" rows={3} value={comment} maxLength={2000} onChange={(changeEvent) => setComment(changeEvent.target.value)} className="mt-2 min-h-24" />
                            <Button type="submit" variant="secondary" shape="pill" className="mt-3" disabled={isBusy}>
                                {texts.decline}
                            </Button>
                            <p className="mt-3 text-xs text-muted">{texts.decisionHint}</p>
                        </form>
                    ) : (
                        <div className="mt-4 flex flex-col gap-3">
                            {unresolved && (
                                <>
                                    <Button shape="pill" className="w-full" disabled={isBusy} onClick={() => run(() => checkRefundStatus(request.id), texts.checked)}>
                                        {isBusy ? texts.checking : texts.checkBank}
                                    </Button>
                                    <p className="text-xs text-muted">{texts.checkBankHint}</p>
                                </>
                            )}
                            {canRetry && (
                                <>
                                    <Button shape="pill" className="w-full" disabled={isBusy} onClick={() => run(() => retryAdminRefund(request.id))}>
                                        {texts.retry}
                                    </Button>
                                    <p className="text-xs text-muted">{texts.retryHint}</p>
                                </>
                            )}
                            {!unresolved && !canRetry && <p className="text-sm text-muted">{isOpen ? texts.processing : texts.nothingToDo}</p>}
                        </div>
                    )}
                    {isMandatory && isOpen && <p className="mt-3 text-xs text-muted">{texts.mandatoryHint}</p>}
                    {message && (
                        <p role="status" className="mt-3 text-sm text-foreground">
                            {message}
                        </p>
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

export default AdminRefundPage
