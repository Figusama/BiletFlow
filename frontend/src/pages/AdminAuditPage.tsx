import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import Select from '../components/ui/Select'
import StatusBadge from '../components/ui/StatusBadge'
import Input from '../components/ui/Input'
import { useAdminAudit } from '../features/admin/api'
import { useHistoryCategories } from '../features/organizer/api'
import { historyDetailText } from '../features/organizer/historyDetail'
import { useLanguage } from '../shared/i18n/language'
import { formatTime, getDateParts } from '../shared/lib/date'

const PAGE_SIZE = 20
const DAY_MS = 24 * 60 * 60 * 1000
const TIME_ZONE = 'Asia/Almaty'

type Period = 'today' | '7' | '30' | 'all'

const periods: Period[] = ['today', '7', '30', 'all']

const results = ['', 'SUCCESS', 'DENIED'] as const

const pagerButton =
    'flex size-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'

const AdminAuditPage = () => {
    const { t } = useLanguage()
    const texts = t.admin.audit
    const history = t.organizerHistory
    const [searchParams, setSearchParams] = useSearchParams()
    const eventId = searchParams.get('event') ?? ''
    const [period, setPeriod] = useState<Period>('today')
    const [category, setCategory] = useState('')
    const [result, setResult] = useState<(typeof results)[number]>('')
    const [page, setPage] = useState(0)
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [actorInput, setActorInput] = useState('')
    const [actor, setActor] = useState('')
    const { data: categories = [] } = useHistoryCategories()

    const from = useMemo(() => {
        if (period === 'all') return null
        const day = new Date()
        day.setHours(0, 0, 0, 0)
        const days = period === 'today' ? 0 : Number(period) - 1
        return new Date(day.getTime() - days * DAY_MS).toISOString()
    }, [period])

    const { data, isPending, isError } = useAdminAudit({ from, category, result, eventId, actor, search, limit: PAGE_SIZE, offset: page * PAGE_SIZE })

    const total = data?.total ?? 0
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const eventTitle = data?.items.find((entry) => entry.event_id === eventId)?.event_title

    const formatDateTime = (iso: string) => {
        const date = new Date(iso)
        const { day, month } = getDateParts(date, TIME_ZONE)
        return `${day} ${t.dates.monthsShort[month]}, ${formatTime(date, TIME_ZONE)}`
    }

    const clearEvent = () => {
        setSearchParams({})
        setPage(0)
    }

    return (
        <div className="flex flex-col gap-6">
            <header>
                <p className="text-xs font-bold tracking-widest text-accent uppercase">{t.admin.groups.system}</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                <p className="mt-1 max-w-2xl text-sm text-muted">{texts.intro}</p>
            </header>

            <form
                className="flex flex-wrap items-center gap-3"
                onSubmit={(submitEvent) => {
                    submitEvent.preventDefault()
                    setSearch(searchInput.trim())
                    setActor(actorInput.trim())
                    setPage(0)
                }}
            >
                <div className="w-full max-w-xs">
                    <label htmlFor="audit-search" className="sr-only">
                        {texts.searchPlaceholder}
                    </label>
                    <Input
                        id="audit-search"
                        type="search"
                        value={searchInput}
                        placeholder={texts.searchPlaceholder}
                        onChange={(changeEvent) => setSearchInput(changeEvent.target.value)}
                    />
                </div>
                <div className="w-full max-w-xs">
                    <label htmlFor="audit-actor" className="sr-only">
                        {texts.actorPlaceholder}
                    </label>
                    <Input
                        id="audit-actor"
                        type="search"
                        value={actorInput}
                        placeholder={texts.actorPlaceholder}
                        onChange={(changeEvent) => setActorInput(changeEvent.target.value)}
                    />
                </div>
                <Select
                    value={period}
                    ariaLabel={texts.period}
                    options={periods.map((value) => ({ value, label: `${texts.period}: ${texts.periods[value]}` }))}
                    onValueChange={(value) => {
                        setPeriod(value)
                        setPage(0)
                    }}
                />
                <Select
                    value={category}
                    ariaLabel={texts.action}
                    options={[
                        { value: '', label: `${texts.action}: ${texts.any}` },
                        ...categories.map((value) => ({ value, label: `${texts.action}: ${history.categories[value] ?? value}` })),
                    ]}
                    onValueChange={(value) => {
                        setCategory(value)
                        setPage(0)
                    }}
                />
                <Select
                    value={result}
                    ariaLabel={texts.result}
                    options={results.map((value) => ({ value, label: `${texts.result}: ${value ? texts.results[value] : texts.any}` }))}
                    onValueChange={(value) => {
                        setResult(value)
                        setPage(0)
                    }}
                />
                {eventId && (
                    <button
                        type="button"
                        onClick={clearEvent}
                        className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent"
                    >
                        {texts.eventFilter(eventTitle ?? eventId)}
                        <Icon name="close" className="size-3.5" />
                    </button>
                )}
            </form>

            {isPending ? (
                <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : data.items.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty}</p>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <table className="w-full min-w-[760px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.columns.time}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.actor}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.action}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.event}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.entity}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.result}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {data.items.map((entry) => (
                                <tr key={entry.id} className="align-top">
                                    <td className="px-5 py-3 whitespace-nowrap text-foreground">{formatDateTime(entry.created_at)}</td>
                                    <td className="px-5 py-3 text-foreground">
                                        {entry.actor.kind === 'system' ? <StatusBadge tone="neutral">{history.system}</StatusBadge> : entry.actor.display_name}
                                    </td>
                                    <td className="px-5 py-3">
                                        <p className="font-semibold text-foreground">{history.actions[entry.action_type] ?? entry.description}</p>
                                        {historyDetailText(entry, t) && <p className="mt-0.5 text-foreground">{historyDetailText(entry, t)}</p>}
                                        <p className="font-mono text-[11px] text-muted">{entry.action_type}</p>
                                    </td>
                                    <td className="px-5 py-3 text-foreground">
                                        {entry.event_id ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSearchParams({ event: entry.event_id as string })
                                                    setPage(0)
                                                }}
                                                className="text-left hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                                            >
                                                {entry.event_title ?? entry.event_id}
                                            </button>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-foreground">
                                        <p className="font-mono text-xs text-muted">{entry.entity_type}</p>
                                        {entry.entity_label && <p>{entry.entity_label}</p>}
                                    </td>
                                    <td className="px-5 py-3">
                                        {entry.result === 'DENIED' ? (
                                            <StatusBadge tone="danger" icon="x-circle">
                                                {texts.results.DENIED}
                                            </StatusBadge>
                                        ) : (
                                            <StatusBadge tone="success" icon="check-circle">
                                                {texts.results.SUCCESS}
                                            </StatusBadge>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {data && data.total > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
                    <span>{texts.range(page * PAGE_SIZE + 1, page * PAGE_SIZE + data.items.length, total)}</span>
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

export default AdminAuditPage
