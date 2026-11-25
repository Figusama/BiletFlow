import { useState } from 'react'
import { Link } from 'react-router-dom'
import Input from '../components/ui/Input'
import { changeReviewStatuses, useAdminChangeRequests, useAdminEvents, waitingTime, type ChangeReviewStatus } from '../features/admin/api'
import { formatDateTime } from '../features/organizer/changes'
import { useLanguage } from '../shared/i18n/language'

const TIME_ZONE = 'Asia/Almaty'

const AdminChangeRequestsPage = () => {
    const { t } = useLanguage()
    const texts = t.admin.changes
    const [status, setStatus] = useState<ChangeReviewStatus>('PENDING')
    const [search, setSearch] = useState('')
    const { data, isPending, isError } = useAdminChangeRequests(status)
    const { data: events = [] } = useAdminEvents()

    const query = search.trim().toLowerCase()
    const requests = (data ?? []).filter((request) => {
        if (!query) return true
        const event = events.find((item) => item.id === request.event_id)
        return [request.request_number, event?.title, event?.organizer_email].some((value) => value?.toLowerCase().includes(query))
    })

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
                <div role="tablist" aria-label={texts.title} className="flex flex-wrap gap-1 rounded-full border border-border bg-surface p-1">
                    {changeReviewStatuses.map((value) => (
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
                            {t.organizerChanges.status[value]}
                        </button>
                    ))}
                </div>
            </header>

            <div className="max-w-md">
                <label htmlFor="change-search" className="sr-only">
                    {texts.searchPlaceholder}
                </label>
                <Input id="change-search" type="search" value={search} placeholder={texts.searchPlaceholder} onChange={(changeEvent) => setSearch(changeEvent.target.value)} />
            </div>

            {isPending ? (
                <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : requests.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty}</p>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <table className="w-full min-w-[820px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.columns.request}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.event}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.fields}</th>
                                <th className="px-5 py-3 text-right font-semibold">{texts.columns.tickets}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.submitted}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {requests.map((request) => {
                                const event = events.find((item) => item.id === request.event_id)
                                const fields = [...new Set(request.items.map((item) => t.organizerChanges.fields[item.field]))]
                                return (
                                    <tr key={request.id} className="align-top">
                                        <td className="px-5 py-3 font-mono text-xs whitespace-nowrap text-muted">
                                            <Link to={`${request.id}?status=${status}`} className="hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
                                                {request.request_number}
                                            </Link>
                                        </td>
                                        <td className="px-5 py-3">
                                            <Link
                                                to={`${request.id}?status=${status}`}
                                                className="font-semibold text-foreground hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                                            >
                                                {event?.title ?? '—'}
                                            </Link>
                                            {event?.organizer_email && <p className="mt-0.5 text-xs text-muted">{event.organizer_email}</p>}
                                        </td>
                                        <td className="px-5 py-3 text-foreground">{fields.join(', ')}</td>
                                        <td className="px-5 py-3 text-right text-foreground">{event?.tickets_issued ?? '—'}</td>
                                        <td className="px-5 py-3 whitespace-nowrap text-foreground">
                                            {request.submitted_at && formatDateTime(request.submitted_at, TIME_ZONE, t)}
                                            {request.submitted_at && status === 'PENDING' && <p className="text-xs text-muted">{waiting(request.submitted_at)}</p>}
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

export default AdminChangeRequestsPage
