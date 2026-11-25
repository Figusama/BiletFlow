import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import StatusBadge from '../components/ui/StatusBadge'
import {
    eventPaidSalesFilters,
    eventStatusFilters,
    eventSuspendedFilters,
    eventVisibilityFilters,
    useAdminEventList,
    type AdminEventStatus,
    type EventPaidSalesFilter,
    type EventSuspendedFilter,
    type EventVisibilityFilter,
} from '../features/admin/api'
import { activationBadge } from '../features/admin/activationBadges'
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
    const [visibility, setVisibility] = useState<EventVisibilityFilter>('ALL')
    const [paidSales, setPaidSales] = useState<EventPaidSalesFilter>('ALL')
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [cityInput, setCityInput] = useState('')
    const [city, setCity] = useState('')
    const [page, setPage] = useState(0)
    const { data, isPending, isError } = useAdminEventList({ status, suspended, visibility, paidSales, city, search, page, pageSize: PAGE_SIZE })

    const events = data?.items ?? []
    const total = data?.total ?? 0
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

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
                    setCity(cityInput.trim())
                    setPage(0)
                }}
            >
                <div className="w-full max-w-sm">
                    <label htmlFor="event-search" className="sr-only">
                        {texts.searchPlaceholder}
                    </label>
                    <Input
                        id="event-search"
                        type="search"
                        value={searchInput}
                        placeholder={texts.searchPlaceholder}
                        onChange={(changeEvent) => setSearchInput(changeEvent.target.value)}
                    />
                </div>
                <div className="w-40">
                    <label htmlFor="event-city" className="sr-only">
                        {texts.city}
                    </label>
                    <Input id="event-city" type="search" value={cityInput} placeholder={texts.city} onChange={(changeEvent) => setCityInput(changeEvent.target.value)} />
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
                <Select
                    value={visibility}
                    ariaLabel={texts.visibilityFilter}
                    options={eventVisibilityFilters.map((value) => ({ value, label: value === 'ALL' ? texts.anyVisibility : t.organizerEvent.visibility[value] }))}
                    onValueChange={(value) => {
                        setVisibility(value)
                        setPage(0)
                    }}
                />
                <Select
                    value={paidSales}
                    ariaLabel={texts.paidSalesFilter}
                    options={eventPaidSalesFilters.map((value) => ({ value, label: value === 'ALL' ? texts.anyPaidSales : t.admin.activations.activationStatus[value] }))}
                    onValueChange={(value) => {
                        setPaidSales(value)
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
                                <th className="px-5 py-3 font-semibold">{texts.columns.paidSales}</th>
                                <th className="px-5 py-3 text-right font-semibold">{texts.columns.sold}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {events.map((event) => {
                                const badge = eventStatusBadge[event.status]
                                const paidSalesBadge = activationBadge[event.paid_sales_status]
                                return (
                                    <tr key={event.id} className="align-top">
                                        <td className="px-5 py-3">
                                            <Link
                                                to={event.public_id}
                                                className="font-semibold text-foreground hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                                            >
                                                {event.title}
                                            </Link>
                                            <p className="mt-0.5 text-xs text-muted">
                                                <span className="font-mono">{event.public_id}</span>, {event.city}, {t.organizerEvent.visibility[event.visibility]}
                                            </p>
                                        </td>
                                        <td className="px-5 py-3 text-foreground">
                                            {event.organizer_name ?? event.organizer_email ?? '—'}
                                            {event.organizer_name && event.organizer_email && <p className="text-xs text-muted">{event.organizer_email}</p>}
                                        </td>
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
                                        <td className="px-5 py-3">
                                            <StatusBadge tone={paidSalesBadge.tone} icon={paidSalesBadge.icon}>
                                                {t.admin.activations.activationStatus[event.paid_sales_status]}
                                            </StatusBadge>
                                        </td>
                                        <td className="px-5 py-3 text-right whitespace-nowrap text-foreground">{texts.soldValue(event.tickets_sold, event.capacity)}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {events.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
                    <span>{texts.range(page * PAGE_SIZE + 1, page * PAGE_SIZE + events.length, total)}</span>
                    <div className="flex items-center gap-2">
                        <button type="button" aria-label={t.admin.applications.previousPage} disabled={page === 0} onClick={() => setPage(page - 1)} className={pagerButton}>
                            <Icon name="chevron-left" className="size-4" />
                        </button>
                        <span className="px-2 text-foreground">
                            {page + 1} / {pageCount}
                        </span>
                        <button type="button" aria-label={t.admin.applications.nextPage} disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)} className={pagerButton}>
                            <Icon name="chevron-left" className="size-4 rotate-180" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default AdminEventsPage
