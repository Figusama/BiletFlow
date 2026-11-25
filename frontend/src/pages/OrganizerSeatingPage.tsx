import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import {
    changeSeats,
    managedSeatsKey,
    managedTicketTypesKey,
    syncSeats,
    useManagedEvent,
    useManagedSeats,
    useManagedTicketTypes,
    type ManagedEvent,
    type SeatChange,
} from '../features/organizer/api'
import type { Seat } from '../features/tickets/api'
import SeatMap from '../features/tickets/components/SeatMap'
import { getTypeColor, groupSeats } from '../features/tickets/seats'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'

const OrganizerSeatingPage = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event, isPending, isError } = useManagedEvent(eventId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !event) return <p className="text-muted">{t.organizerEvent.loadFailed}</p>
    if (event.seating_mode !== 'ASSIGNED_SEATING') return <p className="text-muted">{t.organizerSeats.notAssigned}</p>

    return <Seating key={event.id} event={event} />
}

const isChangeable = (seat: Seat) => seat.state !== 'TAKEN'

const Seating = ({ event }: { event: ManagedEvent }) => {
    const { t } = useLanguage()
    const texts = t.organizerSeats
    const queryClient = useQueryClient()
    const { data: seats = [], isPending, isError } = useManagedSeats(event.id)
    const { data: ticketTypes = [] } = useManagedTicketTypes(event.id)
    const activeTypes = ticketTypes.filter((type) => type.is_active)
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [typeId, setTypeId] = useState('')
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')

    const chosenTypeId = activeTypes.some((type) => type.id === typeId) ? typeId : (activeTypes[0]?.id ?? '')
    const colorOf = (ticketTypeId: string | null) => getTypeColor(ticketTypes, ticketTypeId)

    const store = (updated: Seat[]) => {
        queryClient.setQueryData(managedSeatsKey(event.id), updated)
        queryClient.invalidateQueries({ queryKey: managedTicketTypesKey(event.id) })
        queryClient.invalidateQueries({ queryKey: ['seats', event.id] })
    }

    const run = async (task: () => Promise<Seat[]>) => {
        setIsBusy(true)
        setError('')
        try {
            store(await task())
            setSelectedIds([])
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 409) {
                setError(caught.message.includes('held') ? texts.held : texts.locked)
            } else {
                setError(texts.actionFailed)
            }
        }
        setIsBusy(false)
    }

    const apply = (change: Omit<SeatChange, 'event_seat_ids'>) =>
        run(() => changeSeats(event.id, { event_seat_ids: selectedIds, ...change }))

    const toggleSeat = (seat: Seat) =>
        setSelectedIds((current) => (current.includes(seat.id) ? current.filter((id) => id !== seat.id) : [...current, seat.id]))

    const capacity = seats.filter((seat) => seat.state !== 'UNAVAILABLE').length
    const withoutType = seats.filter((seat) => !seat.ticket_type_id).length
    const turnedOff = seats.filter((seat) => seat.ticket_type_id && seat.state === 'UNAVAILABLE').length

    return (
        <div className="flex flex-col gap-6">
            <header>
                <p className="text-xs font-bold tracking-widest text-accent uppercase">{event.title}</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                <p className="mt-1 max-w-2xl text-sm text-muted">{texts.intro(event.venue_name ?? '')}</p>
            </header>

            {isPending ? (
                <div className="h-96 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : seats.length === 0 ? (
                <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-border p-6">
                    <p className="text-muted">{texts.empty}</p>
                    <Button shape="pill" disabled={isBusy} onClick={() => run(() => syncSeats(event.id))}>
                        {isBusy ? texts.loading : texts.load}
                    </Button>
                </div>
            ) : (
                <>
                    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Stat label={texts.stats.total} value={seats.length} />
                        <Stat label={texts.stats.capacity} value={capacity} hint={texts.stats.capacityHint} />
                        <Stat label={texts.stats.noType} value={withoutType} hint={texts.stats.noTypeHint} highlight={withoutType > 0} />
                        <Stat label={texts.stats.off} value={turnedOff} hint={texts.stats.offHint} />
                    </dl>

                    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 lg:flex-row lg:items-center">
                        <p className="font-semibold text-foreground lg:mr-auto">{texts.selected(selectedIds.length)}</p>
                        {activeTypes.length === 0 ? (
                            <p className="text-sm text-muted">{texts.noTypes}</p>
                        ) : (
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="min-w-56">
                                    <Select
                                        value={chosenTypeId}
                                        ariaLabel={texts.chooseType}
                                        fullWidth
                                        options={activeTypes.map((type) => ({
                                            value: type.id,
                                            label: type.kind === 'PAID' ? `${type.name}, ${formatKzt(type.price_minor)}` : type.name,
                                        }))}
                                        onValueChange={setTypeId}
                                    />
                                </div>
                                <Button
                                    size="sm"
                                    shape="pill"
                                    disabled={isBusy || selectedIds.length === 0 || !chosenTypeId}
                                    onClick={() => apply({ ticket_type_id: chosenTypeId, is_enabled: true })}
                                >
                                    {isBusy ? texts.saving : texts.assign}
                                </Button>
                            </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="secondary" size="sm" shape="pill" disabled={isBusy || selectedIds.length === 0} onClick={() => apply({ ticket_type_id: null })}>
                                {texts.removeType}
                            </Button>
                            <Button variant="secondary" size="sm" shape="pill" disabled={isBusy || selectedIds.length === 0} onClick={() => apply({ is_enabled: false })}>
                                {texts.turnOff}
                            </Button>
                            <Button variant="secondary" size="sm" shape="pill" disabled={isBusy || selectedIds.length === 0} onClick={() => apply({ is_enabled: true })}>
                                {texts.turnOn}
                            </Button>
                            {selectedIds.length > 0 ? (
                                <Button variant="secondary" size="sm" shape="pill" disabled={isBusy} onClick={() => setSelectedIds([])}>
                                    {texts.clear}
                                </Button>
                            ) : (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    shape="pill"
                                    disabled={isBusy}
                                    onClick={() => setSelectedIds(seats.filter(isChangeable).map((seat) => seat.id))}
                                >
                                    {texts.selectAll}
                                </Button>
                            )}
                        </div>
                    </div>

                    {error && (
                        <p role="alert" className="text-sm text-error">
                            {error}
                        </p>
                    )}

                    <SeatMap
                        sections={groupSeats(seats)}
                        ticketTypes={ticketTypes}
                        colorOf={colorOf}
                        selectedIds={selectedIds}
                        onToggle={toggleSeat}
                        isSelectable={isChangeable}
                        selectedLabel={texts.selectedLegend}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                        {withoutType > 0 && <Notice title={texts.noTypeNoticeTitle(withoutType)} text={texts.noTypeNoticeText} />}
                        <Notice tone="warning" title={texts.lockNoticeTitle} text={texts.lockNoticeText} />
                    </div>
                </>
            )}
        </div>
    )
}

const Stat = ({ label, value, hint, highlight = false }: { label: string; value: number; hint?: string; highlight?: boolean }) => (
    <div className="rounded-2xl border border-border bg-surface p-5">
        <dt className="text-sm text-muted">{label}</dt>
        <dd className={`mt-1 text-2xl font-bold ${highlight ? 'text-warning' : 'text-foreground'}`}>{value.toLocaleString('ru-RU')}</dd>
        {hint && <dd className="mt-1 text-xs text-muted">{hint}</dd>}
    </div>
)

const Notice = ({ title, text, tone }: { title: string; text: string; tone?: 'warning' }) => (
    <div className={`rounded-2xl p-5 ${tone === 'warning' ? 'bg-warning-soft' : 'bg-info-soft'}`}>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted">{text}</p>
    </div>
)

export default OrganizerSeatingPage
