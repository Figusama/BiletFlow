import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import StatusBadge from '../components/ui/StatusBadge'
import Textarea from '../components/ui/Textarea'
import {
    approveRefundRequest,
    eventAttendeesKey,
    eventOrdersKey,
    eventRefundsKey,
    rejectRefundRequest,
    useEventOrderDetail,
    useEventRefundRequests,
    useManagedEvent,
    type EventRefundRequest,
    type ManagedEvent,
} from '../features/organizer/api'
import RefundStatusBadge from '../features/organizer/components/RefundStatusBadge'
import { formatDateTime } from '../features/organizer/changes'
import { byOldestFirst, decisionDeadline, hoursLeft, matchesTab, URGENT_HOURS } from '../features/organizer/refunds'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'

const MIN_DECLINE_REASON = 3

const OrganizerRefundDetailPage = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event, isPending, isError } = useManagedEvent(eventId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !event) return <p className="text-muted">{t.organizerEvent.loadFailed}</p>

    return <RefundDetail event={event} />
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="grid gap-1 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
        <dt className="text-sm text-muted">{label}</dt>
        <dd className="text-sm text-foreground">{children}</dd>
    </div>
)

const RefundDetail = ({ event }: { event: ManagedEvent }) => {
    const { t } = useLanguage()
    const texts = t.organizerRefunds
    const { requestId = '' } = useParams()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { data: requests = [], isPending } = useEventRefundRequests(event.id)
    const request = requests.find((item) => item.id === requestId)
    const { data: order } = useEventOrderDetail(event.id, request?.order_id)
    const [declineReason, setDeclineReason] = useState('')
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (!request) return <p className="text-muted">{texts.notFound}</p>

    const waiting = requests.filter((item) => matchesTab(item, 'WAITING')).sort(byOldestFirst)
    const position = waiting.findIndex((item) => item.id === request.id)
    const canDecide = request.status === 'PENDING'
    const urgent = hoursLeft(request) < URGENT_HOURS

    const decide = async (action: (item: EventRefundRequest) => Promise<unknown>) => {
        setIsBusy(true)
        setError('')
        try {
            await action(request)
            await queryClient.invalidateQueries({ queryKey: eventRefundsKey(event.id) })
            queryClient.invalidateQueries({ queryKey: eventOrdersKey(event.id) })
            queryClient.invalidateQueries({ queryKey: eventAttendeesKey(event.id) })
            navigate('..', { relative: 'path' })
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 409 ? texts.notAllowed : texts.failed)
            setIsBusy(false)
        }
    }

    return (
        <div className="flex max-w-2xl flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                    to=".."
                    relative="path"
                    className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                    <Icon name="chevron-left" className="size-4" />
                    {texts.title}
                </Link>
                {position >= 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted">
                        {texts.position(position + 1, waiting.length)}
                        <Link
                            to={`../${waiting[position - 1]?.id ?? ''}`}
                            relative="path"
                            aria-label={texts.previous}
                            aria-disabled={position === 0}
                            tabIndex={position === 0 ? -1 : 0}
                            className={`flex size-8 items-center justify-center rounded-full bg-surface-sunk ${position === 0 ? 'pointer-events-none opacity-40' : 'hover:text-accent'}`}
                        >
                            <Icon name="chevron-left" className="size-4" />
                        </Link>
                        <Link
                            to={`../${waiting[position + 1]?.id ?? ''}`}
                            relative="path"
                            aria-label={texts.next}
                            aria-disabled={position === waiting.length - 1}
                            tabIndex={position === waiting.length - 1 ? -1 : 0}
                            className={`flex size-8 items-center justify-center rounded-full bg-surface-sunk ${position === waiting.length - 1 ? 'pointer-events-none opacity-40' : 'hover:text-accent'}`}
                        >
                            <Icon name="chevron-left" className="size-4 rotate-180" />
                        </Link>
                    </div>
                )}
            </div>

            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{event.title}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                        {order?.buyer_name ?? order?.buyer_email ?? request.order_number}{' '}
                        <span className="font-mono text-base font-normal text-muted">{request.order_number}</span>
                    </h1>
                    <p className="mt-1 text-sm text-muted">
                        {texts.requestedAt(formatDateTime(request.created_at, event.timezone, t))}
                        {request.status === 'PENDING' && `, ${texts.decideBy(formatDateTime(decisionDeadline(request).toISOString(), event.timezone, t))}`}
                    </p>
                </div>
                {request.status === 'PENDING' ? (
                    <StatusBadge tone={urgent ? 'danger' : 'warning'} icon={urgent ? 'x-circle' : 'clock'}>
                        {texts.hoursLeft(hoursLeft(request))}
                    </StatusBadge>
                ) : (
                    <RefundStatusBadge request={request} />
                )}
            </header>

            <section className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-lg font-bold text-foreground">{texts.request}</h2>
                <dl className="mt-2 divide-y divide-border">
                    {order && (
                        <Row label={texts.buyer}>
                            {order.buyer_name && <p className="font-semibold">{order.buyer_name}</p>}
                            <p className={order.buyer_name ? 'text-muted' : ''}>{order.buyer_email}</p>
                        </Row>
                    )}
                    <Row label={texts.reasonLabel}>{texts.reason(request.reason_code)}</Row>
                    {request.comment && <Row label={texts.comment}>{request.comment}</Row>}
                    <Row label={texts.amount}>
                        {formatKzt(request.amount_minor)}
                        <span className="text-muted">{`, ${texts.wholeOrder}`}</span>
                    </Row>
                    {order && (
                        <Row label={texts.tickets}>
                            {order.tickets.map((ticket) => (
                                <p key={ticket.ticket_id}>
                                    <span className="font-mono">{ticket.ticket_public_id}</span>
                                    {`, ${ticket.attendee_name}`}
                                    {ticket.seat_label && `, ${ticket.seat_label}`}
                                    <span className="text-muted">{`, ${t.organizerOrders.attendees.ticketStatus[ticket.status]}`}</span>
                                </p>
                            ))}
                        </Row>
                    )}
                    {order && (
                        <Row label={texts.policy}>
                            {order.refund_deadline ? texts.policyDeadline(formatDateTime(order.refund_deadline, event.timezone, t)) : texts.policyNone}
                        </Row>
                    )}
                </dl>
            </section>

            {canDecide && (
                <section className="rounded-2xl border border-border bg-surface p-5">
                    <h2 className="text-lg font-bold text-foreground">{texts.decision}</h2>
                    <Button className="mt-4" fullWidth shape="pill" disabled={isBusy} onClick={() => decide((item) => approveRefundRequest(item.id))}>
                        {texts.approve(formatKzt(request.amount_minor))}
                    </Button>
                    <p className="mt-2 text-xs text-muted">{texts.approveHint}</p>

                    <div className="mt-5 border-t border-border pt-5">
                        <label htmlFor="decline-reason" className="text-sm font-medium text-foreground">
                            {texts.declineReason}
                        </label>
                        <Textarea
                            id="decline-reason"
                            value={declineReason}
                            maxLength={2000}
                            placeholder={texts.declinePlaceholder}
                            className="mt-2 min-h-24"
                            onChange={(changeEvent) => setDeclineReason(changeEvent.target.value)}
                        />
                        <Button
                            className="mt-3"
                            variant="secondary"
                            shape="pill"
                            disabled={isBusy || declineReason.trim().length < MIN_DECLINE_REASON}
                            onClick={() => decide((item) => rejectRefundRequest(item.id, declineReason.trim()))}
                        >
                            {texts.decline}
                        </Button>
                    </div>
                    {error && (
                        <p role="alert" className="mt-4 text-sm text-error">
                            {error}
                        </p>
                    )}
                </section>
            )}

            {request.status === 'PENDING_ADMIN' && (
                <p className="rounded-2xl bg-surface-sunk p-4 text-sm text-muted">{texts.withPlatformNote}</p>
            )}
        </div>
    )
}

export default OrganizerRefundDetailPage
