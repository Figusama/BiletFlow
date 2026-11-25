import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import StatusBadge, { type BadgeTone } from '../components/ui/StatusBadge'
import {
    managedTicketTypesKey,
    updateTicketType,
    useManagedEvent,
    useManagedTicketTypes,
    usePaidSales,
    type ManagedEvent,
    type ManagedTicketType,
} from '../features/organizer/api'
import TicketTypeForm from '../features/organizer/components/TicketTypeForm'
import type { SaleState } from '../features/tickets/api'
import type { Dictionary } from '../shared/i18n/dictionaries/en'
import { useLanguage } from '../shared/i18n/language'
import { formatTime, getDateParts } from '../shared/lib/date'
import { formatKzt } from '../shared/lib/money'

const saleStateTone: Record<SaleState, BadgeTone> = {
    ON_SALE: 'success',
    SOLD_OUT: 'neutral',
    NOT_STARTED: 'neutral',
    ENDED: 'neutral',
    PAUSED: 'warning',
    DISABLED: 'neutral',
    NOT_ON_SALE: 'neutral',
}

const formatShortDateTime = (iso: string, timeZone: string, t: Dictionary) => {
    const date = new Date(iso)
    const { day, month } = getDateParts(date, timeZone)
    return `${day} ${t.dates.monthsShort[month]}, ${formatTime(date, timeZone)}`
}

const hasInvalidWindow = (type: ManagedTicketType, event: ManagedEvent) =>
    new Date(type.sales_end_at) <= new Date(type.sales_start_at) || new Date(type.sales_end_at) > new Date(event.ends_at)

const OrganizerTicketTypesPage = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event, isPending, isError } = useManagedEvent(eventId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !event) return <p className="text-muted">{t.organizerEvent.loadFailed}</p>

    return <TicketTypes key={event.id} event={event} />
}

const TicketTypes = ({ event }: { event: ManagedEvent }) => {
    const { t } = useLanguage()
    const texts = t.organizerTickets
    const queryClient = useQueryClient()
    const isDraft = event.status === 'DRAFT'
    const { data: ticketTypes = [], isPending, isError } = useManagedTicketTypes(event.id)
    const { data: paidSales } = usePaidSales(event.id)
    const [editing, setEditing] = useState<ManagedTicketType | 'new' | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)
    const [error, setError] = useState('')

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: managedTicketTypesKey(event.id) })
        queryClient.invalidateQueries({ queryKey: ['ticket-types', event.id] })
    }

    const closeForm = () => {
        setEditing(null)
        refresh()
    }

    const toggleSales = async (type: ManagedTicketType) => {
        setBusyId(type.id)
        setError('')
        try {
            await updateTicketType(event.id, type.id, { sales_status: type.sales_status === 'PAUSED' ? 'ACTIVE' : 'PAUSED' })
            refresh()
        } catch {
            setError(texts.actionFailed)
        }
        setBusyId(null)
    }

    const badgeFor = (type: ManagedTicketType): { tone: BadgeTone; label: string } => {
        if (!isDraft) return { tone: saleStateTone[type.sale_state], label: t.tickets.states[type.sale_state] }
        if (!type.is_active) return { tone: 'neutral', label: texts.badges.hidden }
        if (hasInvalidWindow(type, event)) return { tone: 'danger', label: texts.badges.invalidWindow }
        return { tone: 'success', label: texts.badges.ready }
    }

    const quantityFor = (type: ManagedTicketType) => {
        if (event.seating_mode === 'ASSIGNED_SEATING') return type.available === null ? texts.bySeats : texts.quantityValue(type.available)
        return type.quantity_total ? texts.quantityValue(type.quantity_total) : texts.noOwnLimit
    }

    const hasPaidTypes = ticketTypes.some((type) => type.kind === 'PAID')

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{event.title}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                    <p className="mt-1 max-w-2xl text-sm text-muted">{isDraft ? texts.introDraft : texts.introPublished}</p>
                </div>
                {isDraft && editing === null && (
                    <Button shape="pill" onClick={() => setEditing('new')}>
                        <Icon name="plus" className="mr-2 size-4" />
                        {texts.add}
                    </Button>
                )}
            </header>

            {editing !== null && (
                <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
                    <TicketTypeForm
                        key={editing === 'new' ? 'new' : editing.id}
                        event={event}
                        ticketType={editing === 'new' ? null : editing}
                        onDone={closeForm}
                    />
                </section>
            )}

            {error && (
                <p role="alert" className="text-sm text-error">
                    {error}
                </p>
            )}

            {isPending ? (
                <div className="h-40 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : ticketTypes.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty}</p>
            ) : (
                <ul className="flex flex-col gap-3">
                    {ticketTypes.map((type) => {
                        const badge = badgeFor(type)
                        return (
                            <li
                                key={type.id}
                                className="grid gap-3 rounded-2xl border border-border bg-surface px-5 py-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center"
                            >
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-foreground">{type.name}</p>
                                    <p className="mt-0.5 text-sm text-muted">{t.tickets.maxPerOrder(type.max_per_order)}</p>
                                </div>
                                <div>
                                    <p className="font-semibold text-foreground">{type.kind === 'PAID' ? formatKzt(type.price_minor) : texts.kinds.FREE}</p>
                                    <p className="mt-0.5 text-sm text-muted">{quantityFor(type)}</p>
                                </div>
                                <div className="text-sm text-muted">
                                    <p>{formatShortDateTime(type.sales_start_at, event.timezone, t)}</p>
                                    <p>{formatShortDateTime(type.sales_end_at, event.timezone, t)}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                                    <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                                    {isDraft ? (
                                        editing === null && (
                                            <Button variant="secondary" size="sm" shape="pill" onClick={() => setEditing(type)}>
                                                {texts.edit}
                                            </Button>
                                        )
                                    ) : (
                                        event.status === 'PUBLISHED' &&
                                        type.is_active && (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                shape="pill"
                                                disabled={busyId !== null}
                                                onClick={() => toggleSales(type)}
                                            >
                                                {type.sales_status === 'PAUSED' ? texts.resume : texts.pause}
                                            </Button>
                                        )
                                    )}
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                {isDraft && hasPaidTypes && paidSales && paidSales.status !== 'ACTIVE' && (
                    <Notice tone="warning" title={texts.paidNoticeTitle} text={texts.paidNoticeText} />
                )}
                {event.seating_mode === 'GENERAL_ADMISSION' ? (
                    <Notice title={texts.capacityNoticeTitle} text={texts.capacityNoticeText} />
                ) : (
                    <Notice title={texts.seatsNoticeTitle} text={texts.seatsNoticeText} />
                )}
            </div>
        </div>
    )
}

const Notice = ({ title, text, tone }: { title: string; text: string; tone?: 'warning' }) => (
    <div className={`rounded-2xl p-5 ${tone === 'warning' ? 'bg-warning-soft' : 'bg-surface-sunk'}`}>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted">{text}</p>
    </div>
)

export default OrganizerTicketTypesPage
