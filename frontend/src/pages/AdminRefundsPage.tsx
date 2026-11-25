import { useState } from 'react'
import { Link } from 'react-router-dom'
import Input from '../components/ui/Input'
import StatusBadge from '../components/ui/StatusBadge'
import {
    lastAttempt,
    MAX_SYSTEM_ATTEMPTS,
    needsAttention,
    refundTabs,
    useAdminEvents,
    useAdminRefunds,
    waitingTime,
    type AdminRefundRequest,
    type RefundTab,
} from '../features/admin/api'
import { attemptBadge, decisionBadge, executionBadge } from '../features/admin/refundBadges'
import { formatDateTime } from '../features/organizer/changes'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'

const TIME_ZONE = 'Asia/Almaty'

const AdminRefundsPage = () => {
    const { t } = useLanguage()
    const texts = t.admin.refunds
    const [tab, setTab] = useState<RefundTab>('DECISION')
    const [search, setSearch] = useState('')
    const { data, isPending, isError } = useAdminRefunds(tab)
    const { data: events = [] } = useAdminEvents()

    const eventTitle = (eventId: string) => events.find((event) => event.id === eventId)?.title
    const query = search.trim().toLowerCase()
    const requests = (data ?? []).filter(
        (request) => !query || [request.order_number, eventTitle(request.event_id)].some((value) => value?.toLowerCase().includes(query)),
    )

    const note = (request: AdminRefundRequest) => {
        if (request.status === 'PENDING_ADMIN') {
            const { value, unit } = waitingTime(request.created_at)
            return texts.waiting(`${value} ${t.admin.applications.units[unit]}`)
        }
        if (needsAttention(request)) {
            const attempt = lastAttempt(request)
            const systemAttempts = request.attempts.filter((item) => item.attempt_actor === 'SYSTEM').length
            return `${texts.lastAttempt(texts.attemptStatus[attempt.status])}, ${texts.systemAttempts(systemAttempts, MAX_SYSTEM_ATTEMPTS)}`
        }
        return ''
    }

    return (
        <div className="flex flex-col gap-6">
            <header>
                <p className="text-xs font-bold tracking-widest text-accent uppercase">{t.admin.groups.commerce}</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
            </header>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div role="tablist" aria-label={texts.title} className="flex flex-wrap gap-1 rounded-full border border-border bg-surface p-1">
                    {refundTabs.map((value) => (
                        <button
                            key={value}
                            type="button"
                            role="tab"
                            aria-selected={tab === value}
                            onClick={() => setTab(value)}
                            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                                tab === value ? 'bg-night text-on-night' : 'text-foreground hover:bg-surface-sunk'
                            }`}
                        >
                            {texts.tabs[value]}
                        </button>
                    ))}
                </div>
                <div className="w-full max-w-xs">
                    <label htmlFor="refund-search" className="sr-only">
                        {texts.searchPlaceholder}
                    </label>
                    <Input id="refund-search" type="search" value={search} placeholder={texts.searchPlaceholder} onChange={(changeEvent) => setSearch(changeEvent.target.value)} />
                </div>
            </div>

            {isPending ? (
                <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : requests.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty[tab]}</p>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <table className="w-full min-w-[820px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.columns.order}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.source}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.status}</th>
                                <th className="px-5 py-3 text-right font-semibold">{texts.columns.amount}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.requested}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.note}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {requests.map((request) => {
                                const decision = decisionBadge[request.status]
                                const execution = request.execution_status ? executionBadge[request.execution_status] : null
                                const attempt = lastAttempt(request)
                                return (
                                    <tr key={request.id} className="align-top">
                                        <td className="px-5 py-3">
                                            <Link
                                                to={`${request.id}?tab=${tab}`}
                                                className="font-mono text-xs font-semibold text-foreground hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                                            >
                                                {request.order_number}
                                            </Link>
                                            <p className="mt-0.5 text-xs text-muted">{eventTitle(request.event_id) ?? '—'}</p>
                                        </td>
                                        <td className="px-5 py-3 text-foreground">{texts.sources[request.source]}</td>
                                        <td className="px-5 py-3">
                                            <div className="flex flex-col items-start gap-1">
                                                <StatusBadge tone={decision.tone} icon={decision.icon}>
                                                    {texts.decisionStatus[request.status]}
                                                </StatusBadge>
                                                {execution && request.execution_status && (
                                                    <StatusBadge tone={execution.tone} icon={execution.icon}>
                                                        {texts.executionStatus[request.execution_status]}
                                                    </StatusBadge>
                                                )}
                                                {needsAttention(request) && attempt && (
                                                    <StatusBadge tone={attemptBadge[attempt.status].tone} icon={attemptBadge[attempt.status].icon}>
                                                        {texts.attemptStatus[attempt.status]}
                                                    </StatusBadge>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-right font-semibold whitespace-nowrap text-foreground">{formatKzt(request.amount_minor)}</td>
                                        <td className="px-5 py-3 whitespace-nowrap text-muted">{formatDateTime(request.created_at, TIME_ZONE, t)}</td>
                                        <td className="px-5 py-3 text-muted">{note(request)}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

export default AdminRefundsPage
