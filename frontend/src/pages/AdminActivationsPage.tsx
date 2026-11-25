import { useState } from 'react'
import { Link } from 'react-router-dom'
import Input from '../components/ui/Input'
import StatusBadge from '../components/ui/StatusBadge'
import { activationReviewStatuses, useActivationRequests, waitingTime, type ActivationReviewStatus } from '../features/admin/api'
import { applicationBadge } from '../features/applications/status'
import { formatDateTime } from '../features/organizer/changes'
import { usePaidSalesTerms } from '../features/organizer/api'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'

const TIME_ZONE = 'Asia/Almaty'

const AdminActivationsPage = () => {
    const { t } = useLanguage()
    const texts = t.admin.activations
    const [status, setStatus] = useState<ActivationReviewStatus>('PENDING')
    const [search, setSearch] = useState('')
    const { data, isPending, isError } = useActivationRequests(status)
    const { data: terms } = usePaidSalesTerms()

    const query = search.trim().toLowerCase()
    const requests = (data ?? []).filter(
        (request) => !query || [request.event_title, request.verification_snapshot.owner_name].some((value) => value?.toLowerCase().includes(query)),
    )

    const waiting = (iso: string) => {
        const { value, unit } = waitingTime(iso)
        return texts.waiting(`${value} ${t.admin.applications.units[unit]}`)
    }

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{t.admin.groups.moderation}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                </div>
                {terms && <p className="text-sm text-muted">{texts.fee(formatKzt(terms.fee_amount_minor))}</p>}
            </header>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="w-full max-w-sm">
                    <label htmlFor="activation-search" className="sr-only">
                        {texts.searchPlaceholder}
                    </label>
                    <Input id="activation-search" type="search" value={search} placeholder={texts.searchPlaceholder} onChange={(changeEvent) => setSearch(changeEvent.target.value)} />
                </div>
                <div role="tablist" aria-label={texts.title} className="flex flex-wrap gap-1 rounded-full border border-border bg-surface p-1">
                    {activationReviewStatuses.map((value) => (
                        <button
                            key={value}
                            type="button"
                            role="tab"
                            aria-selected={status === value}
                            onClick={() => setStatus(value)}
                            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                                status === value ? 'bg-night text-on-night' : 'text-foreground hover:bg-surface-sunk'
                            }`}
                        >
                            {t.admin.applications.tabs[value]}
                        </button>
                    ))}
                </div>
            </div>

            {isPending ? (
                <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : requests.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty}</p>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <table className="w-full min-w-[720px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.columns.event}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.owner}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.status}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.submitted}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {requests.map((request) => {
                                const badge = applicationBadge[request.status]
                                const snapshot = request.verification_snapshot
                                return (
                                    <tr key={request.id} className="align-top">
                                        <td className="px-5 py-3">
                                            <Link to={`${request.id}?status=${status}`} className="font-semibold text-foreground hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
                                                {request.event_title}
                                            </Link>
                                        </td>
                                        <td className="px-5 py-3 text-foreground">
                                            {snapshot.owner_name ?? '—'}
                                            {snapshot.owner_type && <p className="text-xs text-muted">{texts.ownerTypes[snapshot.owner_type]}</p>}
                                        </td>
                                        <td className="px-5 py-3">
                                            <StatusBadge tone={badge.tone} icon={badge.icon}>
                                                {t.admin.applications.status[request.status]}
                                            </StatusBadge>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap text-foreground">
                                            {formatDateTime(request.submitted_at, TIME_ZONE, t)}
                                            {status === 'PENDING' && <p className="text-xs text-muted">{waiting(request.submitted_at)}</p>}
                                        </td>
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

export default AdminActivationsPage
