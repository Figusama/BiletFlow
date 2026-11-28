import { useState } from 'react'
import { Link } from 'react-router-dom'
import Input from '../components/ui/Input'
import StatusBadge from '../components/ui/StatusBadge'
import { cancellationFilters, useAdminCancellations, useAdminEvents, type CancellationFilter } from '../features/admin/api'
import { applicationBadge } from '../features/applications/status'
import { formatDateTime } from '../features/organizer/changes'
import { useLanguage } from '../shared/i18n/language'

const TIME_ZONE = 'Asia/Almaty'

const AdminCancellationsPage = () => {
    const { t } = useLanguage()
    const texts = t.admin.cancellations
    const [status, setStatus] = useState<CancellationFilter>('PENDING')
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const { data, isPending, isError } = useAdminCancellations(status, search)
    const { data: events = [] } = useAdminEvents()

    const requests = data ?? []

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{t.admin.groups.moderation}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                    <p className="mt-1 text-sm text-muted">{texts.intro}</p>
                </div>
                <div role="tablist" aria-label={texts.title} className="flex flex-wrap gap-1 rounded-full border border-border bg-surface p-1">
                    {cancellationFilters.map((value) => (
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
                            {value === 'ALL' ? texts.all : t.admin.applications.tabs[value]}
                        </button>
                    ))}
                </div>
            </header>

            <form
                className="max-w-md"
                onSubmit={(submitEvent) => {
                    submitEvent.preventDefault()
                    setSearch(searchInput.trim())
                }}
            >
                <label htmlFor="cancellation-search" className="sr-only">
                    {texts.searchPlaceholder}
                </label>
                <Input id="cancellation-search" type="search" value={searchInput} placeholder={texts.searchPlaceholder} onChange={(changeEvent) => setSearchInput(changeEvent.target.value)} />
            </form>

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
                                <th className="px-5 py-3 font-semibold">{texts.columns.organizer}</th>
                                <th className="px-5 py-3 text-right font-semibold">{texts.columns.tickets}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.requested}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.status}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {requests.map((request) => {
                                const event = events.find((item) => item.id === request.event_id)
                                const badge = applicationBadge[request.status]
                                return (
                                    <tr key={request.id} className="align-top">
                                        <td className="px-5 py-3">
                                            <Link to={`${request.id}?status=${status}`} className="font-semibold text-foreground hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
                                                {request.event_title}
                                            </Link>
                                            <p className="mt-0.5 font-mono text-xs text-muted">{request.event_public_id}</p>
                                        </td>
                                        <td className="px-5 py-3 text-foreground">{request.organizer_name ?? event?.organizer_email ?? '—'}</td>
                                        <td className="px-5 py-3 text-right text-foreground">{event?.tickets_issued ?? '—'}</td>
                                        <td className="px-5 py-3 whitespace-nowrap text-foreground">{formatDateTime(request.created_at, TIME_ZONE, t)}</td>
                                        <td className="px-5 py-3">
                                            <StatusBadge tone={badge.tone} icon={badge.icon}>
                                                {t.admin.applications.status[request.status]}
                                            </StatusBadge>
                                            {request.refund_handling_mode && <p className="mt-1 text-xs text-muted">{texts.modes[request.refund_handling_mode]}</p>}
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

export default AdminCancellationsPage
