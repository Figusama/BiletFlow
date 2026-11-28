import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import StatusBadge, { type BadgeIcon, type BadgeTone } from '../components/ui/StatusBadge'
import { useEventRefundRequests, useManagedEvent, type EventRefundRequest, type ManagedEvent } from '../features/organizer/api'
import { formatDateTime } from '../features/organizer/changes'
import RefundStatusBadge from '../features/organizer/components/RefundStatusBadge'
import { byOldestFirst, hoursLeft, isInProgress, matchesTab, refundTabs, URGENT_HOURS, type RefundTab } from '../features/organizer/refunds'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'

const progressBadge = (request: EventRefundRequest): { tone: BadgeTone; icon: BadgeIcon; key: 'waiting' | 'sentToBank' | 'refunded' | 'declinedRetry' | 'declined' } => {
    switch (request.execution_status) {
        case 'SUCCEEDED':
            return { tone: 'success', icon: 'check-circle', key: 'refunded' }
        case 'FAILED_FINAL':
            return { tone: 'danger', icon: 'x-circle', key: request.source === 'ORGANIZER_INITIATED' ? 'declinedRetry' : 'declined' }
        case 'IN_PROGRESS':
            return { tone: 'neutral', icon: 'clock', key: 'sentToBank' }
        default:
            return { tone: 'neutral', icon: 'clock', key: 'waiting' }
    }
}

const OrganizerRefundsPage = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event, isPending, isError } = useManagedEvent(eventId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !event) return <p className="text-muted">{t.organizerEvent.loadFailed}</p>

    return <Refunds key={event.id} event={event} />
}

const Refunds = ({ event }: { event: ManagedEvent }) => {
    const { t } = useLanguage()
    const texts = t.organizerRefunds
    const [tab, setTab] = useState<RefundTab>('WAITING')
    const { data: requests = [], isPending, isError } = useEventRefundRequests(event.id)

    const inTab = requests.filter((request) => matchesTab(request, tab)).sort(tab === 'WAITING' ? byOldestFirst : () => 0)
    const inProgress = requests.filter(isInProgress)

    return (
        <div className="flex flex-col gap-6">
            <header>
                <p className="text-xs font-bold tracking-widest text-accent uppercase">{event.title}</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                <p className="mt-1 text-sm text-muted">{texts.intro}</p>
            </header>

            <div className="flex flex-wrap items-center gap-2">
                {refundTabs.map((value) => (
                    <button
                        key={value}
                        type="button"
                        aria-pressed={tab === value}
                        onClick={() => setTab(value)}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                            tab === value ? 'border-accent bg-accent-soft text-accent' : 'border-border text-foreground hover:border-border-strong'
                        }`}
                    >
                        {texts.tabs[value]} {requests.filter((request) => matchesTab(request, value)).length}
                    </button>
                ))}
            </div>

            {isPending ? (
                <div className="h-40 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : (
                <>
                    {inTab.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty[tab]}</p>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                            <table className="w-full min-w-[720px] text-left text-sm">
                                <thead>
                                    <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                        <th className="px-5 py-3 font-semibold">{texts.columns.order}</th>
                                        <th className="px-5 py-3 font-semibold">{texts.columns.reason}</th>
                                        <th className="px-5 py-3 text-right font-semibold">{texts.columns.amount}</th>
                                        <th className="px-5 py-3 font-semibold">{texts.columns.requested}</th>
                                        <th className="px-5 py-3 font-semibold">{tab === 'WAITING' ? texts.columns.timeLeft : texts.columns.status}</th>
                                        <th className="px-5 py-3" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {inTab.map((request) => (
                                        <tr key={request.id}>
                                            <td className="px-5 py-3 font-mono text-foreground">{request.order_number}</td>
                                            <td className="px-5 py-3 text-foreground">{texts.reason(request.reason_code)}</td>
                                            <td className="px-5 py-3 text-right whitespace-nowrap text-foreground">{formatKzt(request.amount_minor)}</td>
                                            <td className="px-5 py-3 whitespace-nowrap text-muted">{formatDateTime(request.created_at, event.timezone, t)}</td>
                                            <td className="px-5 py-3">
                                                {request.status === 'PENDING' ? (
                                                    <StatusBadge
                                                        tone={hoursLeft(request) < URGENT_HOURS ? 'danger' : 'warning'}
                                                        icon={hoursLeft(request) < URGENT_HOURS ? 'x-circle' : 'clock'}
                                                    >
                                                        {texts.hoursLeft(hoursLeft(request))}
                                                    </StatusBadge>
                                                ) : (
                                                    <RefundStatusBadge request={request} />
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <Link
                                                    to={request.id}
                                                    className="text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                                                >
                                                    {texts.open}
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {inProgress.length > 0 && (
                        <section className="overflow-x-auto rounded-2xl border border-border bg-surface">
                            <h2 className="px-5 pt-5 text-lg font-bold text-foreground">{texts.inProgress}</h2>
                            <table className="mt-3 w-full min-w-[640px] text-left text-sm">
                                <thead>
                                    <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                        <th className="px-5 py-3 font-semibold">{texts.columns.order}</th>
                                        <th className="px-5 py-3 font-semibold">{texts.columns.source}</th>
                                        <th className="px-5 py-3 text-right font-semibold">{texts.columns.amount}</th>
                                        <th className="px-5 py-3 font-semibold">{texts.columns.status}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {inProgress.map((request) => {
                                        const badge = progressBadge(request)
                                        const date = request.execution_status === 'SUCCEEDED' ? request.execution_finalized_at : request.reviewed_at
                                        return (
                                            <tr key={request.id}>
                                                <td className="px-5 py-3 font-mono text-foreground">{request.order_number}</td>
                                                <td className="px-5 py-3 text-foreground">{texts.source[request.source]}</td>
                                                <td className="px-5 py-3 text-right whitespace-nowrap text-foreground">{formatKzt(request.amount_minor)}</td>
                                                <td className="px-5 py-3">
                                                    <StatusBadge tone={badge.tone} icon={badge.icon}>
                                                        {texts.progress[badge.key]}
                                                        {date && badge.key !== 'declined' && badge.key !== 'declinedRetry' ? ` ${formatDateTime(date, event.timezone, t)}` : ''}
                                                    </StatusBadge>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </section>
                    )}
                </>
            )}
        </div>
    )
}

export default OrganizerRefundsPage
