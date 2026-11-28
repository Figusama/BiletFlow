import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import StatusBadge from '../components/ui/StatusBadge'
import { adminCountersKey, adminPaymentsKey, checkPaymentStatus, useAdminPayment, type AdminPaymentDetail, type PaymentWebhook } from '../features/admin/api'
import { attemptBadge } from '../features/admin/refundBadges'
import { paymentBadge } from '../features/admin/paymentBadges'
import { formatDateTime } from '../features/organizer/changes'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'

const TIME_ZONE = 'Asia/Almaty'
const UNFINISHED = ['PENDING', 'AUTHORIZED', 'CAPTURING']

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="grid gap-1 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-4">
        <dt className="text-sm text-muted">{label}</dt>
        <dd className="text-sm font-medium break-words text-foreground">{children}</dd>
    </div>
)

const shorten = (value: string) => (value.length > 14 ? `${value.slice(0, 14)}…` : value)

const verificationTone = { VALID: 'success', INVALID: 'danger', PENDING: 'warning' } as const
const processingTone = { PROCESSED: 'success', REJECTED: 'danger', IGNORED: 'neutral', PENDING: 'warning' } as const

const AdminPaymentPage = () => {
    const { t } = useLanguage()
    const { paymentId } = useParams()
    const { data: payment, isPending, isError } = useAdminPayment(paymentId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !payment) return <p className="text-muted">{t.admin.payments.notFound}</p>

    return <Details key={payment.id} payment={payment} />
}

const Details = ({ payment }: { payment: AdminPaymentDetail }) => {
    const { t } = useLanguage()
    const texts = t.admin.payments
    const queryClient = useQueryClient()
    const [isChecking, setIsChecking] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')

    const badge = paymentBadge[payment.status]
    const isUnfinished = UNFINISHED.includes(payment.status)
    const hasIncident = payment.timeline.some((entry) => entry.type === 'PAYMENT_INCIDENT')

    const check = async () => {
        setIsChecking(true)
        setMessage('')
        setError('')
        try {
            const result = await checkPaymentStatus(payment.id)
            queryClient.setQueryData([...adminPaymentsKey, 'detail', payment.id], result.payment)
            await queryClient.invalidateQueries({ queryKey: adminPaymentsKey })
            await queryClient.invalidateQueries({ queryKey: adminCountersKey })
            const bank = result.bank_status ? texts.bankSays(result.bank_status) : texts.simulatedCheck
            setMessage(result.changed ? texts.checkChanged(bank, texts.status[result.payment.status]) : texts.checkUnchanged(bank))
        } catch (caught) {
            setError(
                caught instanceof ApiError && caught.status === 503 ? texts.bankUnavailable : caught instanceof ApiError && caught.status === 409 ? texts.notSentToBank : texts.checkFailed,
            )
        } finally {
            setIsChecking(false)
        }
    }

    const timelineTitle = (type: string, title: string) =>
        (texts.timelineTypes as Record<string, string>)[type] ?? (t.organizerHistory.actions as Record<string, string>)[type] ?? title

    const webhookRow = (hook: PaymentWebhook) => (
        <tr key={hook.id}>
            <td className="py-3 pr-4 whitespace-nowrap text-foreground">{formatDateTime(hook.received_at, TIME_ZONE, t)}</td>
            <td className="py-3 pr-4">
                <StatusBadge tone={verificationTone[hook.verification_status]}>{texts.verification[hook.verification_status]}</StatusBadge>
            </td>
            <td className="py-3">
                <StatusBadge tone={processingTone[hook.processing_status]}>{texts.processing[hook.processing_status]}</StatusBadge>
            </td>
        </tr>
    )

    return (
        <div className="flex flex-col gap-6">
            <Link
                to="/admin/payments"
                className="inline-flex items-center gap-1 self-start text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
                <Icon name="chevron-left" className="size-4" />
                {texts.allPayments}
            </Link>

            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{texts.kicker}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                        <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground">{payment.order_number}</h1>
                        <StatusBadge tone={badge.tone} icon={badge.icon}>
                            {texts.status[payment.status]}
                        </StatusBadge>
                        {payment.is_simulated && <StatusBadge tone="neutral">{texts.simulated}</StatusBadge>}
                    </div>
                    <p className="mt-1 text-sm text-muted">{[payment.event_title, payment.buyer_name ?? payment.buyer_email, formatKzt(payment.amount_minor)].join(', ')}</p>
                </div>
                {isUnfinished && (
                    <Button variant="secondary" shape="pill" disabled={isChecking} onClick={check}>
                        {isChecking ? texts.checking : texts.checkNow}
                    </Button>
                )}
            </header>

            {message && (
                <p role="status" className="text-sm text-foreground">
                    {message}
                </p>
            )}
            {error && (
                <p role="alert" className="text-sm text-error">
                    {error}
                </p>
            )}

            {hasIncident && (
                <div className="rounded-2xl bg-badge-danger-bg p-4 text-sm text-badge-danger-fg">
                    <p className="font-semibold">{texts.incidentTitle}</p>
                    <p className="mt-1">{texts.incidentText}</p>
                </div>
            )}
            {payment.status === 'CAPTURING' && (
                <div className="rounded-2xl bg-accent-soft p-4 text-sm text-foreground">
                    <p className="font-semibold">{texts.unknownTitle}</p>
                    <p className="mt-1">{texts.unknownText}</p>
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                <section className="rounded-2xl border border-border bg-surface p-6">
                    <h2 className="text-lg font-bold text-foreground">{texts.record}</h2>
                    <dl className="mt-4 flex flex-col gap-3">
                        <Row label={texts.fields.status}>{texts.status[payment.status]}</Row>
                        <Row label={texts.fields.operation}>{payment.pending_operation ? texts.operations[payment.pending_operation] : '—'}</Row>
                        <Row label={texts.fields.reason}>{payment.cancellation_reason ? texts.reasons[payment.cancellation_reason] : '—'}</Row>
                        <Row label={texts.fields.invoice}>
                            <span className="font-mono text-xs">{payment.provider_invoice_id ?? '—'}</span>
                        </Row>
                        <Row label={texts.fields.providerPayment}>
                            <span className="font-mono text-xs">{payment.provider_payment_id ? shorten(payment.provider_payment_id) : '—'}</span>
                        </Row>
                        <Row label={texts.fields.amount}>{`${formatKzt(payment.amount_minor)}, ${texts.fromOrder}`}</Row>
                        <Row label={texts.fields.nextCheck}>
                            {payment.next_check_at
                                ? payment.is_overdue
                                    ? texts.overdue(formatDateTime(payment.next_check_at, TIME_ZONE, t))
                                    : formatDateTime(payment.next_check_at, TIME_ZONE, t)
                                : '—'}
                        </Row>
                        <Row label={texts.fields.failedChecks}>{payment.check_failure_count > 0 ? texts.inARow(payment.check_failure_count) : '0'}</Row>
                        <Row label={texts.fields.fee}>{payment.processing_fee_minor === null ? texts.feeOnSuccess : formatKzt(payment.processing_fee_minor)}</Row>
                        <Row label={texts.fields.order}>{t.organizerOrders.status[payment.order_status as keyof typeof t.organizerOrders.status] ?? payment.order_status}</Row>
                    </dl>
                </section>

                <section className="rounded-2xl border border-border bg-surface p-6">
                    <h2 className="text-lg font-bold text-foreground">{texts.timeline}</h2>
                    <ol className="mt-4 flex flex-col gap-4">
                        {payment.timeline.map((entry, index) => (
                            <li key={`${entry.type}-${entry.at}-${index}`} className="flex gap-3">
                                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-hidden />
                                <div>
                                    <p className="text-sm font-semibold text-foreground">{timelineTitle(entry.type, entry.title)}</p>
                                    <p className="text-xs text-muted">{formatDateTime(entry.at, TIME_ZONE, t)}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </section>
            </div>

            <section className="rounded-2xl border border-border bg-surface p-6">
                <h2 className="text-lg font-bold text-foreground">{texts.webhooks}</h2>
                <p className="mt-1 text-xs text-muted">{texts.webhooksNote}</p>
                {payment.webhooks.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">{texts.noWebhooks}</p>
                ) : (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[420px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                    <th className="py-2 pr-4 font-semibold">{texts.webhookColumns.received}</th>
                                    <th className="py-2 pr-4 font-semibold">{texts.webhookColumns.verification}</th>
                                    <th className="py-2 font-semibold">{texts.webhookColumns.processing}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">{payment.webhooks.map(webhookRow)}</tbody>
                        </table>
                    </div>
                )}
            </section>

            {payment.refunds.length > 0 && (
                <section className="rounded-2xl border border-border bg-surface p-6">
                    <h2 className="text-lg font-bold text-foreground">{texts.refunds}</h2>
                    <ul className="mt-4 flex flex-col gap-3">
                        {payment.refunds.map((attempt) => (
                            <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                                <span className="text-foreground">{`${formatKzt(attempt.amount_minor)}, ${formatDateTime(attempt.created_at, TIME_ZONE, t)}`}</span>
                                <div className="flex items-center gap-3">
                                    <StatusBadge tone={attemptBadge[attempt.status].tone} icon={attemptBadge[attempt.status].icon}>
                                        {t.admin.refunds.attemptStatus[attempt.status]}
                                    </StatusBadge>
                                    <Link to={`/admin/refunds/${attempt.refund_request_id}`} className="font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
                                        {texts.openRefund}
                                    </Link>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    )
}

export default AdminPaymentPage
