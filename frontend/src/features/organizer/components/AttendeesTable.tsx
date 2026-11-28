import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import Input from '../../../components/ui/Input'
import Select from '../../../components/ui/Select'
import StatusBadge, { type BadgeIcon, type BadgeTone } from '../../../components/ui/StatusBadge'
import { useLanguage } from '../../../shared/i18n/language'
import { formatKzt } from '../../../shared/lib/money'
import {
    downloadAttendeesCsv,
    useEventAttendees,
    useManagedTicketTypes,
    type AttendeeFilters,
    type EventAttendee,
    type PaymentStatus,
    type TicketStatus,
} from '../api'

const PAGE_SIZE = 50
const ALL_TYPES = 'ALL'

const ticketBadge: Record<TicketStatus, { tone: BadgeTone; icon: BadgeIcon }> = {
    VALID: { tone: 'neutral', icon: 'check-circle' },
    CHECKED_IN: { tone: 'success', icon: 'check-circle' },
    CANCELLED: { tone: 'neutral', icon: 'ban' },
    REFUNDED: { tone: 'danger', icon: 'x-circle' },
}

const checkedInChips: { value: boolean | null; key: 'all' | 'checkedIn' | 'notCheckedIn' }[] = [
    { value: null, key: 'all' },
    { value: true, key: 'checkedIn' },
    { value: false, key: 'notCheckedIn' },
]

interface AttendeesTableProps {
    eventId: string
}

const AttendeesTable = ({ eventId }: AttendeesTableProps) => {
    const { t } = useLanguage()
    const texts = t.organizerOrders.attendees
    const [searchText, setSearchText] = useState('')
    const [filters, setFilters] = useState<AttendeeFilters>({ search: '', checkedIn: null, ticketTypeId: null, hasPromo: false })
    const [limit, setLimit] = useState(PAGE_SIZE)
    const [isExporting, setIsExporting] = useState(false)
    const { data: ticketTypes = [] } = useManagedTicketTypes(eventId)
    const { data, isPending, isError, isFetching } = useEventAttendees(eventId, filters, limit)

    useEffect(() => {
        const timer = setTimeout(() => {
            setFilters((current) => ({ ...current, search: searchText.trim() }))
            setLimit(PAGE_SIZE)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchText])

    const changeFilters = (changes: Partial<AttendeeFilters>) => {
        setFilters((current) => ({ ...current, ...changes }))
        setLimit(PAGE_SIZE)
    }

    const exportCsv = async () => {
        setIsExporting(true)
        try {
            await downloadAttendeesCsv(eventId, filters)
        } finally {
            setIsExporting(false)
        }
    }

    const typeOptions = [{ value: ALL_TYPES, label: texts.allTypes }, ...ticketTypes.map((type) => ({ value: type.id, label: type.name }))]
    const items = data?.items ?? []

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-72">
                    <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                    <Input
                        type="search"
                        aria-label={texts.search}
                        placeholder={texts.search}
                        value={searchText}
                        className="pl-9"
                        onChange={(changeEvent) => setSearchText(changeEvent.target.value)}
                    />
                </div>
                {checkedInChips.map((chip) => (
                    <button
                        key={chip.key}
                        type="button"
                        aria-pressed={filters.checkedIn === chip.value}
                        onClick={() => changeFilters({ checkedIn: chip.value })}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                            filters.checkedIn === chip.value ? 'border-accent bg-accent-soft text-accent' : 'border-border text-foreground hover:border-border-strong'
                        }`}
                    >
                        {texts.chips[chip.key]}
                        {data && chip.key === 'all' && ` ${data.counts.all}`}
                        {data && chip.key === 'checkedIn' && ` ${data.counts.checked_in}`}
                    </button>
                ))}
                <button
                    type="button"
                    aria-pressed={filters.hasPromo}
                    onClick={() => changeFilters({ hasPromo: !filters.hasPromo })}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                        filters.hasPromo ? 'border-accent bg-accent-soft text-accent' : 'border-border text-foreground hover:border-border-strong'
                    }`}
                >
                    {texts.withPromo}
                </button>
                <Select
                    value={filters.ticketTypeId ?? ALL_TYPES}
                    options={typeOptions}
                    ariaLabel={texts.ticketType}
                    onValueChange={(value) => changeFilters({ ticketTypeId: value === ALL_TYPES ? null : value })}
                />
                <div className="sm:ml-auto">
                    <Button variant="secondary" size="sm" shape="pill" disabled={isExporting} onClick={exportCsv}>
                        {texts.exportCsv}
                    </Button>
                </div>
            </div>

            {data && data.counts.pending_orders > 0 && filters.checkedIn === null && (
                <p className="text-sm text-muted">{texts.pendingOrders(data.counts.pending_orders)}</p>
            )}

            {isPending ? (
                <div className="h-40 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : items.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty}</p>
            ) : (
                <>
                    <div className={`overflow-x-auto rounded-2xl border border-border bg-surface ${isFetching ? 'opacity-70' : ''}`}>
                        <table className="w-full min-w-[820px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                    <th className="px-5 py-3 font-semibold">{texts.columns.attendee}</th>
                                    <th className="px-5 py-3 font-semibold">{texts.columns.ticket}</th>
                                    <th className="px-5 py-3 font-semibold">{texts.columns.order}</th>
                                    <th className="px-5 py-3 font-semibold">{texts.columns.status}</th>
                                    <th className="px-5 py-3 text-right font-semibold">{texts.columns.paid}</th>
                                    <th className="px-5 py-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {items.map((row) => (
                                    <AttendeeRow key={row.ticket_id ?? row.order_id} row={row} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {data && items.length < data.total && (
                        <div className="flex justify-center">
                            <Button variant="secondary" shape="pill" disabled={isFetching} onClick={() => setLimit(limit + PAGE_SIZE)}>
                                {t.organizerOrders.showMore}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

const paymentTone: Partial<Record<PaymentStatus, BadgeTone>> = { FAILED: 'danger', CANCELLED: 'neutral' }

const AttendeeRow = ({ row }: { row: EventAttendee }) => {
    const { t } = useLanguage()
    const texts = t.organizerOrders.attendees
    const buyer = row.buyer_name ?? row.buyer_email

    return (
        <tr>
            <td className="px-5 py-3">
                {row.ticket_id ? (
                    <>
                        <p className="font-semibold text-foreground">{row.attendee_name}</p>
                        <p className="text-xs text-muted">{row.buyer_email}</p>
                    </>
                ) : (
                    <>
                        <p className="font-semibold text-foreground">{buyer}</p>
                        <p className="text-xs text-muted">{texts.pendingTickets(row.quantity)}</p>
                    </>
                )}
            </td>
            <td className="px-5 py-3">
                {row.ticket_id ? (
                    <>
                        <p className="font-mono text-foreground">{row.ticket_public_id}</p>
                        <p className="text-xs text-muted">{[row.ticket_type_name, row.seat_label].filter(Boolean).join(', ')}</p>
                    </>
                ) : (
                    <p className="text-xs text-muted">{row.ticket_type_name ?? texts.severalTypes}</p>
                )}
            </td>
            <td className="px-5 py-3">
                <p className="font-mono text-foreground">{row.order_number}</p>
                {row.promo_code && <p className="text-xs text-muted">{row.promo_code}</p>}
            </td>
            <td className="px-5 py-3">
                {row.ticket_status ? (
                    <StatusBadge tone={ticketBadge[row.ticket_status].tone} icon={ticketBadge[row.ticket_status].icon}>
                        {texts.ticketStatus[row.ticket_status]}
                    </StatusBadge>
                ) : (
                    <StatusBadge tone={row.payment_status ? (paymentTone[row.payment_status] ?? 'warning') : 'warning'} icon="clock">
                        {row.payment_status ? texts.paymentStatus[row.payment_status] : texts.orderPending}
                    </StatusBadge>
                )}
            </td>
            <td className="px-5 py-3 text-right whitespace-nowrap">
                {row.ticket_id ? <span className="text-foreground">{formatKzt(row.paid_minor)}</span> : <span className="text-muted">{texts.notPaidYet}</span>}
            </td>
            <td className="px-5 py-3 text-right">
                <Link to={row.order_id} className="text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
                    {texts.open}
                </Link>
            </td>
        </tr>
    )
}

export default AttendeesTable
