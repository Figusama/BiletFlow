import { useQueryClient } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import StatusBadge, { type BadgeIcon, type BadgeTone } from '../components/ui/StatusBadge'
import {
    promoCodesKey,
    setPromoCodeActive,
    useCampaignStats,
    useManagedEvent,
    useManagedTicketTypes,
    usePromoCodes,
    type ManagedEvent,
    type PromoCode,
} from '../features/organizer/api'
import PromoCodeForm from '../features/organizer/components/PromoCodeForm'
import { useLanguage } from '../shared/i18n/language'
import { getDateParts } from '../shared/lib/date'
import { formatKzt } from '../shared/lib/money'

type PromoState = 'ACTIVE' | 'SCHEDULED' | 'EXHAUSTED' | 'EXPIRED' | 'DISABLED'

const stateBadge: Record<PromoState, { tone: BadgeTone; icon: BadgeIcon }> = {
    ACTIVE: { tone: 'success', icon: 'check-circle' },
    SCHEDULED: { tone: 'warning', icon: 'clock' },
    EXHAUSTED: { tone: 'danger', icon: 'x-circle' },
    EXPIRED: { tone: 'neutral', icon: 'clock' },
    DISABLED: { tone: 'neutral', icon: 'ban' },
}

const promoState = (promo: PromoCode, now: number): PromoState => {
    if (!promo.is_active) return 'DISABLED'
    if (promo.max_redemptions !== null && promo.redemption_count >= promo.max_redemptions) return 'EXHAUSTED'
    if (now > new Date(promo.valid_until).getTime()) return 'EXPIRED'
    if (now < new Date(promo.valid_from).getTime()) return 'SCHEDULED'
    return 'ACTIVE'
}

const OrganizerPromoCodesPage = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event, isPending, isError } = useManagedEvent(eventId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !event) return <p className="text-muted">{t.organizerEvent.loadFailed}</p>

    return <PromoCodes key={event.id} event={event} />
}

const PromoCodes = ({ event }: { event: ManagedEvent }) => {
    const { t } = useLanguage()
    const texts = t.organizerPromo
    const queryClient = useQueryClient()
    const { data: promos = [], isPending, isError } = usePromoCodes(event.id)
    const { data: ticketTypes = [] } = useManagedTicketTypes(event.id)
    const [isCreating, setIsCreating] = useState(false)
    const [openId, setOpenId] = useState<string | null>(null)
    const [now] = useState(() => Date.now())

    const isClosed = event.status === 'CANCELLED' || event.status === 'COMPLETED'

    const shortDate = (iso: string) => {
        const { day, month } = getDateParts(new Date(iso), event.timezone)
        return `${day} ${t.dates.monthsShort[month]}`
    }

    const appliesTo = (promo: PromoCode) =>
        promo.application_scope === 'ORDER'
            ? texts.allTypes
            : promo.ticket_type_ids.map((id) => ticketTypes.find((type) => type.id === id)?.name ?? '').filter(Boolean).join(', ')

    const discount = (promo: PromoCode) =>
        promo.discount_type === 'PERCENTAGE' ? `${(promo.percentage_bps ?? 0) / 100}%` : formatKzt(promo.fixed_amount_minor ?? 0)

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{event.title}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                </div>
                {!isClosed && !isCreating && (
                    <Button shape="pill" onClick={() => setIsCreating(true)}>
                        <Icon name="plus" className="mr-2 size-4" />
                        {texts.new}
                    </Button>
                )}
            </header>

            {isCreating && (
                <PromoCodeForm
                    event={event}
                    ticketTypes={ticketTypes}
                    onDone={(saved) => {
                        setIsCreating(false)
                        if (saved) {
                            queryClient.invalidateQueries({ queryKey: promoCodesKey(event.id) })
                            queryClient.invalidateQueries({ queryKey: ['organizer-events', event.id, 'campaigns'] })
                        }
                    }}
                />
            )}

            {isPending ? (
                <div className="h-40 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : promos.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty}</p>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <table className="w-full min-w-[720px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.columns.code}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.discount}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.appliesTo}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.valid}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.redeemed}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.state}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {promos.map((promo) => {
                                const state = promoState(promo, now)
                                const badge = stateBadge[state]
                                const isOpen = openId === promo.id
                                const share = promo.max_redemptions ? Math.min(100, (promo.redemption_count / promo.max_redemptions) * 100) : 0
                                return (
                                    <Fragment key={promo.id}>
                                        <tr
                                            tabIndex={0}
                                            aria-expanded={isOpen}
                                            onClick={() => setOpenId(isOpen ? null : promo.id)}
                                            onKeyDown={(keyEvent) => {
                                                if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                                                    keyEvent.preventDefault()
                                                    setOpenId(isOpen ? null : promo.id)
                                                }
                                            }}
                                            className="cursor-pointer hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent"
                                        >
                                            <td className="px-5 py-3 font-mono font-semibold text-foreground">{promo.code}</td>
                                            <td className="px-5 py-3 text-foreground">{discount(promo)}</td>
                                            <td className="px-5 py-3 text-foreground">{appliesTo(promo)}</td>
                                            <td className="px-5 py-3 whitespace-nowrap text-foreground">
                                                {shortDate(promo.valid_from)} – {shortDate(promo.valid_until)}
                                            </td>
                                            <td className="px-5 py-3">
                                                <p className="text-foreground">
                                                    {promo.redemption_count} / {promo.max_redemptions ?? '∞'}
                                                </p>
                                                {promo.max_redemptions && (
                                                    <div className="mt-1 h-1.5 w-28 rounded-full bg-accent-soft">
                                                        <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-5 py-3">
                                                <StatusBadge tone={badge.tone} icon={badge.icon}>
                                                    {texts.states[state]}
                                                </StatusBadge>
                                            </td>
                                        </tr>
                                        {isOpen && (
                                            <tr>
                                                <td colSpan={6} className="bg-surface-sunk px-5 py-4">
                                                    <PromoDetails event={event} promo={promo} isClosed={isClosed} />
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

interface PromoDetailsProps {
    event: ManagedEvent
    promo: PromoCode
    isClosed: boolean
}

const PromoDetails = ({ event, promo, isClosed }: PromoDetailsProps) => {
    const { t } = useLanguage()
    const texts = t.organizerPromo.details
    const queryClient = useQueryClient()
    const { data: stats } = useCampaignStats(event.id, promo.campaign_id)
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')
    const [isCopied, setIsCopied] = useState(false)

    const toggle = async () => {
        setIsBusy(true)
        setError('')
        try {
            await setPromoCodeActive(event.id, promo.id, !promo.is_active)
            await queryClient.invalidateQueries({ queryKey: promoCodesKey(event.id) })
        } catch {
            setError(texts.actionFailed)
        }
        setIsBusy(false)
    }

    const copyLink = async () => {
        if (!promo.campaign_link) return
        await navigator.clipboard.writeText(promo.campaign_link)
        setIsCopied(true)
    }

    return (
        <div className="flex flex-col gap-4">
            {promo.campaign_link && (
                <div>
                    <p className="text-xs font-semibold tracking-widest text-muted uppercase">{texts.campaignLink}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                        <span className="min-w-0 truncate text-sm text-foreground">{promo.campaign_link}</span>
                        <Button variant="secondary" size="sm" shape="pill" onClick={copyLink}>
                            <Icon name="copy" className="mr-2 size-4" />
                            {isCopied ? texts.copied : texts.copy}
                        </Button>
                    </div>
                </div>
            )}

            {stats && (
                <dl className="grid gap-4 sm:grid-cols-4">
                    <Stat label={texts.ticketsSold} value={String(stats.tickets_sold)} />
                    <Stat label={texts.gross} value={formatKzt(stats.gross_minor)} />
                    <Stat label={texts.discountGiven} value={formatKzt(stats.discount_minor)} />
                    <Stat label={texts.netAfterRefunds} value={formatKzt(stats.net_after_refunds_minor)} />
                </dl>
            )}

            {error && (
                <p role="alert" className="text-sm text-error">
                    {error}
                </p>
            )}

            {!isClosed && (
                <div>
                    <Button variant="secondary" size="sm" shape="pill" disabled={isBusy} onClick={toggle}>
                        {promo.is_active ? texts.disable : texts.enable}
                    </Button>
                </div>
            )}
        </div>
    )
}

const Stat = ({ label, value }: { label: string; value: string }) => (
    <div>
        <dt className="text-xs font-semibold tracking-widest text-muted uppercase">{label}</dt>
        <dd className="mt-1 text-sm font-semibold text-foreground">{value}</dd>
    </div>
)

export default OrganizerPromoCodesPage
