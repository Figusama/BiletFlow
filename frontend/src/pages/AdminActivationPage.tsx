import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import StatusBadge from '../components/ui/StatusBadge'
import Textarea from '../components/ui/Textarea'
import {
    activationReviewStatuses,
    activationsKey,
    approveActivation,
    rejectActivation,
    useActivationRequests,
    type ActivationRequest,
    type ActivationReviewStatus,
} from '../features/admin/api'
import { applicationBadge } from '../features/applications/status'
import { usePaidSalesTerms } from '../features/organizer/api'
import { formatDateTime } from '../features/organizer/changes'
import { useTicketTypes } from '../features/tickets/api'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'

const TIME_ZONE = 'Asia/Almaty'
const MIN_REJECT_REASON = 3

const pagerButton =
    'flex size-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="grid gap-1 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
        <dt className="text-sm text-muted">{label}</dt>
        <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
)

const groupDigits = (masked: string) => masked.replace(/(.{4})(?=.)/g, '$1 ')

const normalize = (value: string | undefined) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

const AdminActivationPage = () => {
    const { t } = useLanguage()
    const { requestId } = useParams()
    const [searchParams] = useSearchParams()
    const rawStatus = searchParams.get('status')
    const status: ActivationReviewStatus = activationReviewStatuses.find((value) => value === rawStatus) ?? 'PENDING'
    const { data: requests, isPending, isError } = useActivationRequests(status)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    const index = requests?.findIndex((request) => request.id === requestId) ?? -1
    if (isError || !requests || index < 0) return <p className="text-muted">{t.admin.activations.notFound}</p>

    return <Review key={requests[index].id} request={requests[index]} index={index} all={requests} status={status} />
}

interface ReviewProps {
    request: ActivationRequest
    index: number
    all: ActivationRequest[]
    status: ActivationReviewStatus
}

const Review = ({ request, index, all, status }: ReviewProps) => {
    const { t } = useLanguage()
    const texts = t.admin.activations
    const queryClient = useQueryClient()
    const { data: terms } = usePaidSalesTerms()
    const { data: ticketTypes = [] } = useTicketTypes(request.event_id)
    const [reason, setReason] = useState('')
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')

    const snapshot = request.verification_snapshot
    const badge = applicationBadge[request.status]
    const isPending = request.status === 'PENDING'
    const holderDiffers = Boolean(snapshot.account_holder_name) && normalize(snapshot.account_holder_name) !== normalize(snapshot.owner_name)
    const paidTypes = ticketTypes.filter((type) => type.kind === 'PAID')

    const neighbour = (offset: number) => {
        const target = all[index + offset]
        return target ? `/admin/paid-sales/${target.id}?status=${status}` : null
    }
    const previous = neighbour(-1)
    const next = neighbour(1)

    const run = async (action: () => Promise<unknown>) => {
        setIsBusy(true)
        setError('')
        try {
            await action()
            await queryClient.invalidateQueries({ queryKey: activationsKey })
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 403) setError(texts.ownRequest)
            else if (caught instanceof ApiError && caught.status === 409) setError(texts.alreadyReviewed)
            else setError(texts.actionFailed)
            await queryClient.invalidateQueries({ queryKey: activationsKey })
        } finally {
            setIsBusy(false)
        }
    }

    const reject = (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        const text = reason.trim()
        if (text.length < MIN_REJECT_REASON) {
            setError(texts.rejectReasonRequired)
            return
        }
        void run(() => rejectActivation(request.id, text))
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between gap-3">
                <Link
                    to="/admin/paid-sales"
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
                <StatusBadge tone={badge.tone} icon={badge.icon}>
                    {t.admin.applications.status[request.status]}
                </StatusBadge>
                <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
                    {request.event_title} <span className="font-mono text-base font-normal text-muted">{request.event_public_id}</span>
                </h1>
                <p className="mt-1 text-sm text-muted">
                    {[request.organizer_name, texts.submittedAt(formatDateTime(request.submitted_at, TIME_ZONE, t))].filter(Boolean).join(', ')}
                </p>

                <div className="mt-6 grid gap-6 md:grid-cols-2">
                    <section>
                        <h2 className="text-lg font-bold text-foreground">{texts.details}</h2>
                        <p className="mt-1 text-xs text-muted">{texts.demoCheck}</p>
                        <dl className="mt-4 flex flex-col gap-3">
                            <Row label={texts.fields.owner}>
                                {[snapshot.owner_type && texts.ownerTypes[snapshot.owner_type], snapshot.owner_name].filter(Boolean).join(', ') || '—'}
                            </Row>
                            <Row label={texts.fields.identifier}>
                                {snapshot.identifier_masked ? groupDigits(snapshot.identifier_masked) : '—'}
                                {request.checks && (
                                    <span className="mt-1 flex flex-wrap gap-1.5">
                                        <StatusBadge tone={request.checks.identifier_format ? 'success' : 'danger'}>{request.checks.identifier_format ? texts.formatOk : texts.formatBad}</StatusBadge>
                                        <StatusBadge tone={request.checks.identifier_checksum ? 'success' : 'danger'}>
                                            {request.checks.identifier_checksum ? texts.checksumOk : texts.checksumBad}
                                        </StatusBadge>
                                    </span>
                                )}
                            </Row>
                            <Row label={texts.fields.responsible}>
                                {[snapshot.responsible_person_name, snapshot.contact_email, snapshot.contact_phone].filter(Boolean).join(', ') || '—'}
                            </Row>
                            <Row label={texts.fields.bank}>{snapshot.bank_name ?? '—'}</Row>
                            <Row label={texts.fields.iban}>
                                {snapshot.iban_masked ? groupDigits(snapshot.iban_masked) : '—'}
                                {request.checks && (
                                    <span className="mt-1 flex flex-wrap gap-1.5">
                                        <StatusBadge tone={request.checks.iban_format ? 'success' : 'danger'}>{request.checks.iban_format ? texts.formatOk : texts.formatBad}</StatusBadge>
                                        <StatusBadge tone={request.checks.iban_checksum ? 'success' : 'danger'}>{request.checks.iban_checksum ? texts.checksumOk : texts.checksumBad}</StatusBadge>
                                    </span>
                                )}
                            </Row>
                            <Row label={texts.fields.holder}>
                                {snapshot.account_holder_name ?? '—'}
                                {holderDiffers && <p className="mt-1 font-normal text-badge-warning-fg">{texts.holderDiffers}</p>}
                            </Row>
                            <Row label={texts.fields.terms}>{texts.termsValue(request.terms_version)}</Row>
                            <Row label={texts.fields.ticketTypes}>
                                {paidTypes.length === 0 ? '—' : paidTypes.map((type) => `${type.name} ${formatKzt(type.price_minor)}`).join(', ')}
                            </Row>
                        </dl>
                        <p className="mt-4 text-xs text-muted">{texts.checksDisclaimer}</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-foreground">{texts.decision}</h2>
                        {isPending ? (
                            <form onSubmit={reject} noValidate>
                                <p className="mt-3 rounded-2xl bg-accent-soft p-4 text-sm text-foreground">
                                    {terms ? texts.approveHint(formatKzt(terms.fee_amount_minor)) : texts.approveHintNoFee}
                                </p>
                                <label htmlFor="activation-reason" className="mt-4 block text-sm font-semibold text-foreground">
                                    {texts.reasonLabel}
                                </label>
                                <Textarea
                                    id="activation-reason"
                                    rows={3}
                                    value={reason}
                                    maxLength={2000}
                                    onChange={(changeEvent) => setReason(changeEvent.target.value)}
                                    className="mt-2 min-h-24"
                                />
                                <p className="mt-2 text-xs text-muted">{texts.reasonHint}</p>
                                <div className="mt-3 flex flex-wrap gap-3">
                                    <Button type="button" shape="pill" disabled={isBusy} onClick={() => run(() => approveActivation(request.id))}>
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
                                {request.rejection_reason && <p className="mt-2 whitespace-pre-line">{request.rejection_reason}</p>}
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

export default AdminActivationPage
