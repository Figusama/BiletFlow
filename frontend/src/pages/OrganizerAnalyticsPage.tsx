import { useState } from 'react'
import { useParams } from 'react-router-dom'
import Select from '../components/ui/Select'
import Input from '../components/ui/Input'
import { useEventAnalytics, useManagedEvent, useManagedTicketTypes, type AnalyticsRange, type EventAnalytics, type ManagedEvent } from '../features/organizer/api'
import { useLanguage } from '../shared/i18n/language'
import { fromDateTimeInput } from '../shared/lib/date'
import { formatKzt } from '../shared/lib/money'

const periods = ['ALL', '7', '30', 'CUSTOM'] as const
type Period = (typeof periods)[number]

const nextDay = (date: string) => {
    const [year, month, day] = date.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
}

const ALL_TYPES = 'ALL'

const numberFormat = new Intl.NumberFormat('ru-RU')

interface MetricProps {
    label: string
    value: string
    note?: string
    progress?: number | null
}

const Metric = ({ label, value, note, progress }: MetricProps) => (
    <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
        {progress != null && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-accent-soft">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, progress)}%` }} />
            </div>
        )}
        {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </div>
)

const OrganizerAnalyticsPage = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event, isPending, isError } = useManagedEvent(eventId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !event) return <p className="text-muted">{t.organizerEvent.loadFailed}</p>

    return <Analytics key={event.id} event={event} />
}

const Analytics = ({ event }: { event: ManagedEvent }) => {
    const { t } = useLanguage()
    const texts = t.organizerAnalytics
    const [period, setPeriod] = useState<Period>('ALL')
    const [fromDate, setFromDate] = useState('')
    const [toDate, setToDate] = useState('')
    const [ticketTypeId, setTicketTypeId] = useState(ALL_TYPES)
    const { data: ticketTypes = [] } = useManagedTicketTypes(event.id)

    const customFrom = fromDate ? fromDateTimeInput(`${fromDate}T00:00`, event.timezone) : null
    const customTo = toDate ? fromDateTimeInput(`${nextDay(toDate)}T00:00`, event.timezone) : null
    const isCustom = period === 'CUSTOM'
    const isCustomValid = customFrom !== null && customTo !== null && new Date(customTo) > new Date(customFrom)
    const range: AnalyticsRange = isCustom ? { days: null, from: customFrom, to: customTo } : { days: period === 'ALL' ? null : Number(period), from: null, to: null }
    const { data, isPending, isError } = useEventAnalytics(event.id, range, ticketTypeId === ALL_TYPES ? null : ticketTypeId, !isCustom || isCustomValid)

    const periodOptions = periods.map((value) => ({ value, label: texts.periods[value] }))
    const typeOptions = [{ value: ALL_TYPES, label: texts.allTypes }, ...ticketTypes.map((type) => ({ value: type.id, label: type.name }))]

    return (
        <div className="flex flex-col gap-6">
            <header>
                <p className="text-xs font-bold tracking-widest text-accent uppercase">{event.title}</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
            </header>

            <div className="flex flex-wrap items-center gap-3">
                <Select value={period} options={periodOptions} onValueChange={setPeriod} ariaLabel={texts.period} />
                {isCustom && (
                    <>
                        <label className="flex items-center gap-2 text-sm text-muted">
                            {texts.from}
                            <Input
                                type="date"
                                value={fromDate}
                                max={toDate || undefined}
                                className="w-auto py-2"
                                onChange={(changeEvent) => setFromDate(changeEvent.target.value)}
                            />
                        </label>
                        <label className="flex items-center gap-2 text-sm text-muted">
                            {texts.to}
                            <Input type="date" value={toDate} min={fromDate || undefined} className="w-auto py-2" onChange={(changeEvent) => setToDate(changeEvent.target.value)} />
                        </label>
                    </>
                )}
                <Select value={ticketTypeId} options={typeOptions} onValueChange={setTicketTypeId} ariaLabel={texts.ticketType} />
                <p className="text-xs text-muted">{texts.basis}</p>
            </div>

            {isCustom && !isCustomValid ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{fromDate && toDate ? texts.invalidRange : texts.pickDates}</p>
            ) : isPending ? (
                <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : (
                <AnalyticsContent data={data} filteredByType={ticketTypeId !== ALL_TYPES} />
            )}
        </div>
    )
}

const AnalyticsContent = ({ data, filteredByType }: { data: EventAnalytics; filteredByType: boolean }) => {
    const { t } = useLanguage()
    const texts = t.organizerAnalytics
    const { inventory, financial, attendance } = data
    const money = (value: number | null) => (value === null ? '—' : formatKzt(value))
    const peak = Math.max(1, ...data.sales_over_time.map((point) => point.tickets))

    return (
        <>
            {financial.is_demonstration && <p className="w-fit rounded-lg border border-dashed border-border-strong px-3 py-1 text-xs font-medium text-muted">{texts.demoMoney}</p>}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Metric
                    label={texts.sold}
                    value={numberFormat.format(inventory.sold)}
                    progress={inventory.percent_sold}
                    note={texts.soldNote(inventory.historical_confirmed_tickets)}
                />
                <Metric
                    label={texts.remaining}
                    value={inventory.remaining_inventory === null ? '—' : numberFormat.format(inventory.remaining_inventory)}
                    note={inventory.capacity === null ? undefined : texts.remainingNote(inventory.capacity)}
                />
                <Metric label={texts.checkedIn} value={numberFormat.format(attendance.checked_in)} note={texts.checkedInNote(attendance.eligible)} />
                <Metric label={texts.gross} value={formatKzt(financial.gross_sales_minor)} note={texts.grossNote} />
                <Metric label={texts.discounts} value={financial.discounts_minor > 0 ? `−${formatKzt(financial.discounts_minor)}` : formatKzt(0)} note={texts.discountsNote} />
                <Metric label={texts.collected} value={money(financial.collected_minor)} note={texts.collectedNote} />
                <Metric label={texts.refunded} value={money(financial.refunded_minor)} note={texts.refundedNote} />
                <Metric label={texts.net} value={money(financial.net_revenue_minor)} note={texts.netNote} />
                <Metric label={texts.proceeds} value={money(financial.estimated_proceeds_minor)} note={texts.proceedsNote} />
            </div>
            {filteredByType && <p className="text-xs text-muted">{texts.moneyNeedsAllTypes}</p>}
            <p className="text-xs text-muted">{texts.currentNote}</p>

            <section className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-lg font-bold text-foreground">{texts.chartTitle}</h2>
                {data.sales_over_time.length === 0 ? (
                    <p className="py-10 text-center text-muted">{texts.chartEmpty}</p>
                ) : (
                    <ol className="mt-6 flex h-52 items-end gap-2 overflow-x-auto pb-1">
                        {data.sales_over_time.map((point) => (
                            <li
                                key={point.bucket_start}
                                title={`${point.bucket_start.slice(0, 10)}: ${point.tickets}`}
                                className="flex h-full max-w-20 min-w-8 flex-1 flex-col justify-end gap-1 text-center"
                            >
                                <span className="text-xs text-muted">{point.tickets}</span>
                                <div className="rounded-t-md bg-accent" style={{ height: `${(point.tickets / peak) * 80}%`, minHeight: 4 }} />
                                <span className="text-xs text-muted">{point.bucket_start.slice(8, 10)}</span>
                            </li>
                        ))}
                    </ol>
                )}
            </section>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <section className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <h2 className="px-5 pt-5 text-lg font-bold text-foreground">{texts.byType}</h2>
                    <table className="mt-3 w-full min-w-[420px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.columns.type}</th>
                                <th className="px-5 py-3 text-right font-semibold">{texts.columns.sold}</th>
                                <th className="px-5 py-3 text-right font-semibold">{texts.columns.available}</th>
                                <th className="px-5 py-3 text-right font-semibold">{texts.columns.gross}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {data.by_ticket_type.map((type) => (
                                <tr key={type.ticket_type_id}>
                                    <td className="px-5 py-3 font-semibold text-foreground">{type.name}</td>
                                    <td className="px-5 py-3 text-right text-foreground">{numberFormat.format(type.sold)}</td>
                                    <td className="px-5 py-3 text-right text-foreground">{numberFormat.format(type.available)}</td>
                                    <td className="px-5 py-3 text-right whitespace-nowrap text-foreground">{formatKzt(type.gross_sales_minor)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>

                <section className="rounded-2xl border border-border bg-surface p-5">
                    <h2 className="text-lg font-bold text-foreground">{texts.checkIn}</h2>
                    <div className="mt-5 flex items-center justify-between text-sm">
                        <span className="text-muted">{texts.checkedInLabel}</span>
                        <span className="font-bold text-foreground">
                            {attendance.checked_in} / {attendance.eligible}
                        </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-accent-soft">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${attendance.check_in_percentage ?? 0}%` }} />
                    </div>
                    <p className="mt-3 text-xs text-muted">{texts.absentNote(attendance.absent)}</p>
                </section>
            </div>

            <section className="overflow-x-auto rounded-2xl border border-border bg-surface">
                <h2 className="px-5 pt-5 text-lg font-bold text-foreground">{texts.promos}</h2>
                {data.promotions.length === 0 ? (
                    <p className="px-5 py-8 text-center text-muted">{texts.promosEmpty}</p>
                ) : (
                    <table className="mt-3 w-full min-w-[640px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.promoColumns.code}</th>
                                <th className="px-5 py-3 font-semibold">{texts.promoColumns.campaign}</th>
                                <th className="px-5 py-3 text-right font-semibold">{texts.promoColumns.redemptions}</th>
                                <th className="px-5 py-3 text-right font-semibold">{texts.promoColumns.tickets}</th>
                                <th className="px-5 py-3 text-right font-semibold">{texts.promoColumns.gross}</th>
                                <th className="px-5 py-3 text-right font-semibold">{texts.promoColumns.discounts}</th>
                                <th className="px-5 py-3 text-right font-semibold">{texts.promoColumns.refunded}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {data.promotions.map((promo) => (
                                <tr key={promo.promo_code_id}>
                                    <td className="px-5 py-3 font-mono font-semibold text-foreground">{promo.code}</td>
                                    <td className="px-5 py-3 text-foreground">{promo.campaign_name ?? '—'}</td>
                                    <td className="px-5 py-3 text-right text-foreground">{numberFormat.format(promo.redemptions)}</td>
                                    <td className="px-5 py-3 text-right text-foreground">{numberFormat.format(promo.tickets)}</td>
                                    <td className="px-5 py-3 text-right whitespace-nowrap text-foreground">{formatKzt(promo.gross_sales_minor)}</td>
                                    <td className="px-5 py-3 text-right whitespace-nowrap text-foreground">{formatKzt(promo.discounts_minor)}</td>
                                    <td className="px-5 py-3 text-right whitespace-nowrap text-foreground">{money(promo.refunded_minor)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>
        </>
    )
}

export default OrganizerAnalyticsPage
