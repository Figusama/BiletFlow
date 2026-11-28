import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import StatusBadge from '../components/ui/StatusBadge'
import Textarea from '../components/ui/Textarea'
import { activationsKey, resumePaidSales, suspendPaidSales, useAdminActivationDetail, type AdminActivationDetail } from '../features/admin/api'
import { activationBadge } from '../features/admin/activationBadges'
import { applicationBadge } from '../features/applications/status'
import { formatDateTime } from '../features/organizer/changes'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'

const TIME_ZONE = 'Asia/Almaty'
const MIN_REASON = 3

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="grid gap-1 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-4">
        <dt className="text-sm text-muted">{label}</dt>
        <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
)

const AdminActivationEventPage = () => {
    const { t } = useLanguage()
    const { eventId } = useParams()
    const { data: activation, isPending, isError } = useAdminActivationDetail(eventId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !activation) return <p className="text-muted">{t.admin.activations.notFound}</p>

    return <Details key={activation.event_id} activation={activation} />
}

const Details = ({ activation }: { activation: AdminActivationDetail }) => {
    const { t } = useLanguage()
    const texts = t.admin.activations
    const queryClient = useQueryClient()
    const [reason, setReason] = useState('')
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')

    const badge = activationBadge[activation.status]
    const isClosed = activation.event_status === 'CANCELLED' || activation.event_status === 'COMPLETED'

    const run = async (action: () => Promise<unknown>) => {
        setIsBusy(true)
        setError('')
        try {
            await action()
            setReason('')
            await queryClient.invalidateQueries({ queryKey: activationsKey })
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 409 ? texts.eventConflict : texts.actionFailed)
        } finally {
            setIsBusy(false)
        }
    }

    const suspend = (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        const text = reason.trim()
        if (text.length < MIN_REASON) {
            setError(texts.rejectReasonRequired)
            return
        }
        void run(() => suspendPaidSales(activation.event_id, text))
    }

    return (
        <div className="flex flex-col gap-6">
            <Link
                to="/admin/paid-sales"
                className="inline-flex items-center gap-1 self-start text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
                <Icon name="chevron-left" className="size-4" />
                {texts.allActivations}
            </Link>

            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{texts.kicker}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                        {activation.event_title} <span className="font-mono text-base font-normal text-muted">{activation.event_public_id}</span>
                    </h1>
                    <p className="mt-1 text-sm text-muted">{activation.organizer_name ?? activation.organizer_email ?? '—'}</p>
                </div>
                <StatusBadge tone={badge.tone} icon={badge.icon}>
                    {texts.activationStatus[activation.status]}
                </StatusBadge>
            </header>

            <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                <section className="rounded-2xl border border-border bg-surface p-6">
                    <h2 className="text-lg font-bold text-foreground">{texts.summary}</h2>
                    <dl className="mt-4 flex flex-col gap-3">
                        <Row label={texts.fields.fee}>{formatKzt(activation.fee_amount_minor)}</Row>
                        <Row label={texts.fields.feePaid}>{activation.fee_paid_at ? formatDateTime(activation.fee_paid_at, TIME_ZONE, t) : '—'}</Row>
                        <Row label={texts.fields.activated}>{activation.activated_at ? formatDateTime(activation.activated_at, TIME_ZONE, t) : '—'}</Row>
                        <Row label={texts.fields.terms}>{activation.paid_terms_version ? texts.termsValue(activation.paid_terms_version) : '—'}</Row>
                    </dl>
                    {activation.pending_request_id && (
                        <Link
                            to={`/admin/paid-sales/${activation.pending_request_id}?status=PENDING`}
                            className="mt-5 inline-block text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                        >
                            {texts.reviewPending}
                        </Link>
                    )}
                </section>

                <section className="rounded-2xl border border-border bg-surface p-6">
                    <h2 className="text-lg font-bold text-foreground">{activation.status === 'SUSPENDED' ? texts.suspension : texts.control}</h2>
                    {activation.status === 'SUSPENDED' ? (
                        <>
                            <div className="mt-4 rounded-2xl bg-badge-danger-bg p-4 text-sm text-badge-danger-fg">
                                <p className="font-semibold">
                                    {[activation.suspended_at && texts.suspendedAt(formatDateTime(activation.suspended_at, TIME_ZONE, t)), activation.suspended_by_name]
                                        .filter(Boolean)
                                        .join(', ')}
                                </p>
                                {activation.suspension_reason && <p className="mt-1 whitespace-pre-line">{activation.suspension_reason}</p>}
                            </div>
                            <p className="mt-3 text-sm text-muted">{texts.resumeHint}</p>
                            <Button className="mt-4" shape="pill" disabled={isBusy || isClosed} onClick={() => run(() => resumePaidSales(activation.event_id))}>
                                {texts.resume}
                            </Button>
                        </>
                    ) : activation.status === 'ACTIVE' ? (
                        <form onSubmit={suspend} noValidate>
                            <p className="mt-3 rounded-2xl bg-accent-soft p-4 text-sm text-foreground">{texts.suspendHint}</p>
                            <label htmlFor="suspend-paid-reason" className="mt-4 block text-sm font-semibold text-foreground">
                                {texts.suspendReason}
                            </label>
                            <Textarea id="suspend-paid-reason" rows={3} value={reason} maxLength={2000} onChange={(changeEvent) => setReason(changeEvent.target.value)} className="mt-2 min-h-24" />
                            <Button type="submit" variant="secondary" shape="pill" className="mt-3" disabled={isBusy || isClosed}>
                                {texts.suspend}
                            </Button>
                        </form>
                    ) : (
                        <p className="mt-3 text-sm text-muted">{texts.noControl}</p>
                    )}
                    {error && (
                        <p role="alert" className="mt-3 text-sm text-error">
                            {error}
                        </p>
                    )}
                </section>
            </div>

            <section className="rounded-2xl border border-border bg-surface p-6">
                <h2 className="text-lg font-bold text-foreground">{texts.requestsHistory}</h2>
                {activation.requests.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">{texts.noRequests}</p>
                ) : (
                    <ul className="mt-4 flex flex-col gap-3">
                        {activation.requests.map((request) => {
                            const requestBadge = applicationBadge[request.status]
                            return (
                                <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 text-sm">
                                    <div>
                                        <p className="text-foreground">{formatDateTime(request.submitted_at, TIME_ZONE, t)}</p>
                                        {request.rejection_reason && <p className="mt-0.5 text-muted">{request.rejection_reason}</p>}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <StatusBadge tone={requestBadge.tone} icon={requestBadge.icon}>
                                            {t.admin.applications.status[request.status]}
                                        </StatusBadge>
                                        <Link
                                            to={`/admin/paid-sales/${request.id}?status=${request.status}`}
                                            className="font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                                        >
                                            {texts.openRequest}
                                        </Link>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </section>

            {activation.fee_payments.length > 0 && (
                <section className="rounded-2xl border border-border bg-surface p-6">
                    <h2 className="text-lg font-bold text-foreground">{texts.feePayments}</h2>
                    <ul className="mt-4 flex flex-col gap-3">
                        {activation.fee_payments.map((payment) => (
                            <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                                <span className="text-foreground">{`${formatKzt(payment.amount_minor)}, ${formatDateTime(payment.created_at, TIME_ZONE, t)}`}</span>
                                <span className="text-muted">{`${texts.feeStatus[payment.status]}, ${texts.feeMode[payment.payment_mode]}`}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    )
}

export default AdminActivationEventPage
