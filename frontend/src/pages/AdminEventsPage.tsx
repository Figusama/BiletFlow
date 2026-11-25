import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import StatusBadge from '../components/ui/StatusBadge'
import { eventStatusFilters, eventSuspendedFilters, useAdminEventList, type AdminEventStatus, type EventSuspendedFilter } from '../features/admin/api'
import { eventStatusBadge } from '../features/admin/eventBadges'
import { formatDateTime } from '../features/organizer/changes'
import { useLanguage } from '../shared/i18n/language'

const PAGE_SIZE = 20
const TIME_ZONE = 'Asia/Almaty'

const pagerButton =
    'flex size-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'

const AdminEventsPage = () => {
    const { t } = useLanguage()
    const texts = t.admin.events
    const [status, setStatus] = useState<'ALL' | AdminEventStatus>('ALL')
    const [suspended, setSuspended] = useState<EventSuspendedFilter>('ALL')
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(0)
    const { data, isPending, isError } = useAdminEventList(status, suspended, search, page, PAGE_SIZE)

    const events = data?.slice(0, PAGE_SIZE) ?? []
    const hasNextPage = (data?.length ?? 0) > PAGE_SIZE

    return (
        <div className="flex flex-col gap-6">
            <header>
                <p className="text-xs font-bold tracking-widest text-accent uppercase">{t.admin.groups.directory}</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
            </header>

            <form
                className="flex flex-wrap items-center gap-3"
                onSubmit={(submitEvent) => {
                    submitEvent.preventDefault()
                    setSearch(searchInput.trim())
                    setPage(0)
                }}
            >
                <div className="w-full max-w-sm">
                    <label htmlFor="event-search" className="sr-only">
                        {texts.searchPlaceholder}
                    </label>
                    <Input id="event-search" type="search" value={searchInput} placeholder={texts.searchPlaceholder} onChange={(changeEvent) => setSearchInput(changeEvent.target.value)} />
                </div>
                <Select
                    value={status}
                    ariaLabel={texts.statusFilter}
                    options={eventStatusFilters.map((value) => ({ value, label: value === 'ALL' ? texts.anyStatus : t.organizerEvent.status[value] }))}
                    onValueChange={(value) => {
                        setStatus(value)
                        setPage(0)
                    }}
                />
                <Select
                    value={suspended}
                    ariaLabel={texts.suspendedFilter}
                    options={eventSuspendedFilters.map((value) => ({ value, label: texts.suspendedOptions[value] }))}
                    onValueChange={(value) => {
                        setSuspended(value)
                        setPage(0)
                    }}
                />
            </form>

            {isPending ? (
                <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : events.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty}</p>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <table className="w-full min-w-[720px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.columns.event}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.organizer}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.starts}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.status}</th>
                                <th className="px-5 py-3 text-right font-semibold">{texts.columns.tickets}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {events.map((event) => {
                                const badge = eventStatusBadge[event.status]
                                return (
                                    <tr key={event.id} className="align-top">
                                        <td className="px-5 py-3">
                                            <Link to={event.public_id} className="font-semibold text-foreground hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
                                                {event.title}
                                            </Link>
                                            <p className="mt-0.5 font-mono text-xs text-muted">{event.public_id}</p>
                                        </td>
                                        <td className="px-5 py-3 text-foreground">{event.organizer_email ?? '—'}</td>
                                        <td className="px-5 py-3 whitespace-nowrap text-foreground">{formatDateTime(event.starts_at, TIME_ZONE, t)}</td>
                                        <td className="px-5 py-3">
                                            <div className="flex flex-col items-start gap-1">
                                                <StatusBadge tone={badge.tone} icon={badge.icon}>
                                                    {t.organizerEvent.status[event.status]}
                                                </StatusBadge>
                                                {event.is_suspended && (
                                                    <StatusBadge tone="danger" icon="ban">
                                                        {texts.suspended}
                                                    </StatusBadge>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-right text-foreground">{event.tickets_issued}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {events.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
                    <span>{t.admin.applications.range(page * PAGE_SIZE + 1, page * PAGE_SIZE + events.length)}</span>
                    <div className="flex items-center gap-2">
                        <button type="button" aria-label={t.admin.applications.previousPage} disabled={page === 0} onClick={() => setPage(page - 1)} className={pagerButton}>
                            <Icon name="chevron-left" className="size-4" />
                        </button>
                        <span className="px-2 text-foreground">{page + 1}</span>
                        <button type="button" aria-label={t.admin.applications.nextPage} disabled={!hasNextPage} onClick={() => setPage(page + 1)} className={pagerButton}>
                            <Icon name="chevron-left" className="size-4 rotate-180" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default AdminEventsPage
