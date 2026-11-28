import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import Select from '../components/ui/Select'
import StatusBadge from '../components/ui/StatusBadge'
import { useEventHistory, useHistoryCategories, useManagedEvent, type ManagedEvent } from '../features/organizer/api'
import { historyDetailText } from '../features/organizer/historyDetail'
import { useLanguage } from '../shared/i18n/language'
import { formatTime, getDateParts } from '../shared/lib/date'

const PAGE_SIZE = 20
const DAY_MS = 24 * 60 * 60 * 1000

type Period = '7' | '30' | '90' | 'all'

const periods: Period[] = ['7', '30', '90', 'all']

const OrganizerHistoryPage = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event, isPending, isError } = useManagedEvent(eventId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !event) return <p className="text-muted">{t.organizerEvent.loadFailed}</p>

    return <History key={event.id} event={event} />
}

const History = ({ event }: { event: ManagedEvent }) => {
    const { t } = useLanguage()
    const texts = t.organizerHistory
    const [period, setPeriod] = useState<Period>('30')
    const [category, setCategory] = useState('')
    const [page, setPage] = useState(0)
    const { data: categories = [] } = useHistoryCategories()

    const from = useMemo(() => {
        if (period === 'all') return null
        const day = new Date()
        day.setHours(0, 0, 0, 0)
        return new Date(day.getTime() - (Number(period) - 1) * DAY_MS).toISOString()
    }, [period])

    const { data, isPending, isError } = useEventHistory(event.id, { from, category, limit: PAGE_SIZE, offset: page * PAGE_SIZE })

    const total = data?.total ?? 0
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

    const formatDateTime = (iso: string) => {
        const date = new Date(iso)
        const { day, month } = getDateParts(date, event.timezone)
        return `${day} ${t.dates.monthsShort[month]}, ${formatTime(date, event.timezone)}`
    }

    const pagerButton =
        'flex size-8 items-center justify-center rounded-full text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'

    return (
        <div className="flex flex-col gap-6">
            <header>
                <p className="text-xs font-bold tracking-widest text-accent uppercase">{event.title}</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                <p className="mt-1 max-w-2xl text-sm text-muted">{texts.intro}</p>
            </header>

            <div className="flex flex-wrap gap-3">
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
                    ariaLabel={texts.activity}
                    options={[
                        { value: '', label: `${texts.activity}: ${texts.all}` },
                        ...categories.map((value) => ({ value, label: `${texts.activity}: ${texts.categories[value] ?? value}` })),
                    ]}
                    onValueChange={(value) => {
                        setCategory(value)
                        setPage(0)
                    }}
                />
            </div>

            {isPending ? (
                <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : data.items.length === 0 ? (
                <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">{texts.empty}</p>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <table className="w-full min-w-[640px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.columns.when}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.who}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.what}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {data.items.map((entry) => (
                                <tr key={entry.id}>
                                    <td className="px-5 py-3 whitespace-nowrap text-foreground">{formatDateTime(entry.created_at)}</td>
                                    <td className="px-5 py-3 text-foreground">
                                        {entry.actor.kind === 'system' ? <StatusBadge tone="neutral">{texts.system}</StatusBadge> : entry.actor.display_name}
                                    </td>
                                    <td className="px-5 py-3">
                                        <p className="font-semibold text-foreground">{texts.actions[entry.action_type] ?? entry.description}</p>
                                        {historyDetailText(entry, t) && <p className="mt-0.5 text-foreground">{historyDetailText(entry, t)}</p>}
                                        <p className="font-mono text-[11px] text-muted">{entry.action_type}</p>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {data && data.total > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
                    <span>{texts.range(page * PAGE_SIZE + 1, page * PAGE_SIZE + data.items.length, total)}</span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            aria-label={texts.previousPage}
                            disabled={page === 0}
                            onClick={() => setPage(page - 1)}
                            className={`${pagerButton} border border-border text-foreground hover:bg-surface-sunk`}
                        >
                            <Icon name="chevron-left" className="size-4" />
                        </button>
                        <span className="px-2 text-sm text-foreground">
                            {page + 1} / {pageCount}
                        </span>
                        <button
                            type="button"
                            aria-label={texts.nextPage}
                            disabled={page + 1 >= pageCount}
                            onClick={() => setPage(page + 1)}
                            className={`${pagerButton} border border-border text-foreground hover:bg-surface-sunk`}
                        >
                            <Icon name="chevron-left" className="size-4 rotate-180" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default OrganizerHistoryPage
