import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import {
    paidSalesKey,
    startFeePayment,
    useManagedEvent,
    usePaidSales,
    usePaidSalesTerms,
    type ManagedEvent,
    type PaidSales,
} from '../features/organizer/api'
import PaidSalesForm from '../features/organizer/components/PaidSalesForm'
import type { Dictionary } from '../shared/i18n/dictionaries/en'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'

type StateKey = keyof Dictionary['organizerPaidSales']['states']

const STEPS = ['request', 'verification', 'fee', 'active'] as const

const stepOf: Record<StateKey, number> = {
    notRequested: 0,
    rejected: 0,
    review: 1,
    fee: 2,
    feeChecking: 2,
    active: 3,
    suspended: 3,
    closed: 0,
}

const getStateKey = (event: ManagedEvent, paidSales: PaidSales): StateKey => {
    if (paidSales.status === 'ACTIVE') return 'active'
    if (paidSales.status === 'SUSPENDED') return 'suspended'
    if (event.status === 'CANCELLED' || event.status === 'COMPLETED') return 'closed'
    if (paidSales.status === 'FEE_PENDING') {
        return paidSales.fee_payments.some((payment) => payment.status === 'UNKNOWN') ? 'feeChecking' : 'fee'
    }
    const latest = paidSales.requests[0]
    if (latest?.status === 'PENDING') return 'review'
    if (latest?.status === 'REJECTED') return 'rejected'
    return 'notRequested'
}

const OrganizerPaidSalesPage = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event, isPending, isError } = useManagedEvent(eventId)
    const paidSales = usePaidSales(eventId)

    if (isPending || paidSales.isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !event) return <p className="text-muted">{t.organizerEvent.loadFailed}</p>
    if (paidSales.isError || !paidSales.data) return <p className="text-muted">{t.organizerPaidSales.loadFailed}</p>

    return <PaidSalesOverview key={event.id} event={event} paidSales={paidSales.data} />
}

const PaidSalesOverview = ({ event, paidSales }: { event: ManagedEvent; paidSales: PaidSales }) => {
    const { t } = useLanguage()
    const texts = t.organizerPaidSales
    const queryClient = useQueryClient()
    const { data: terms } = usePaidSalesTerms()
    const [paymentKey] = useState(() => crypto.randomUUID())
    const [isPaying, setIsPaying] = useState(false)
    const [payError, setPayError] = useState('')

    const stateKey = getStateKey(event, paidSales)
    const state = texts.states[stateKey]
    const latestRequest = paidSales.requests[0]
    const latestPayment = paidSales.fee_payments[0]
    const showForm = stateKey === 'notRequested' || stateKey === 'rejected'
    const feeAmount = formatKzt(paidSales.fee_amount_minor)

    const handlePay = async () => {
        setIsPaying(true)
        setPayError('')
        try {
            const payment = await startFeePayment(event.id, paymentKey)
            const target = payment.payment_url ?? payment.simulator_url
            if (target) {
                window.location.assign(target)
                return
            }
            await queryClient.invalidateQueries({ queryKey: paidSalesKey(event.id) })
        } catch {
            setPayError(texts.payFailed)
        }
        setIsPaying(false)
    }

    return (
        <div className="flex flex-col gap-6">
            <header>
                <p className="text-xs font-bold tracking-widest text-accent uppercase">{event.title}</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                <p className="mt-1 max-w-2xl text-sm text-muted">{texts.intro}</p>
            </header>

            <section className="flex flex-col gap-4 rounded-2xl bg-night p-6 text-on-night sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xl font-bold">{state.title}</p>
                    <p className="mt-1 text-sm opacity-80">{state.text}</p>
                    {stateKey === 'rejected' && latestRequest?.rejection_reason && (
                        <p className="mt-2 text-sm">{texts.rejectionReason(latestRequest.rejection_reason)}</p>
                    )}
                </div>
                <div className="shrink-0 sm:text-right">
                    <p className="text-xs opacity-80">{texts.feeLabel}</p>
                    <p className="text-2xl font-bold">{feeAmount}</p>
                </div>
            </section>

            <ol className="grid gap-2 sm:grid-cols-4">
                {STEPS.map((step, index) => {
                    const isDone = index < stepOf[stateKey] || stateKey === 'active'
                    const isCurrent = index === stepOf[stateKey] && stateKey !== 'active'
                    return (
                        <li key={step} className="flex items-center gap-2 text-sm">
                            <span
                                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                    isDone ? 'bg-success-soft text-success' : isCurrent ? 'bg-accent text-accent-foreground' : 'border border-border text-muted'
                                }`}
                            >
                                {isDone ? <Icon name="check-circle" className="size-4" /> : index + 1}
                            </span>
                            <span className={isCurrent ? 'font-semibold text-foreground' : 'text-muted'}>{texts.steps[step]}</span>
                        </li>
                    )
                })}
            </ol>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                <div className="flex flex-col gap-6">
                    {showForm && (
                        <PaidSalesForm
                            eventId={event.id}
                            termsVersion={terms?.version ?? ''}
                            onSubmitted={(updated) => queryClient.setQueryData(paidSalesKey(event.id), updated)}
                        />
                    )}

                    {!showForm && latestRequest && (
                        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
                            <h2 className="text-lg font-bold text-foreground">{texts.summary.title}</h2>
                            <dl className="mt-3 divide-y divide-border">
                                <SummaryRow label={texts.summary.receiver}>{latestRequest.verification_snapshot.owner_name}</SummaryRow>
                                <SummaryRow mono label={texts.summary.identifier}>{latestRequest.verification_snapshot.identifier_masked}</SummaryRow>
                                <SummaryRow label={texts.summary.bank}>{latestRequest.verification_snapshot.bank_name}</SummaryRow>
                                <SummaryRow mono label={texts.summary.iban}>{latestRequest.verification_snapshot.iban_masked}</SummaryRow>
                            </dl>
                        </section>
                    )}

                    {stateKey === 'fee' && (
                        <section className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-5 sm:p-6">
                            {latestPayment?.status === 'FAILED' && <p className="text-sm text-warning">{texts.lastFailed}</p>}
                            <Button shape="pill" disabled={isPaying} onClick={handlePay}>
                                {isPaying ? texts.paying : texts.pay(feeAmount)}
                            </Button>
                            {payError && (
                                <p role="alert" className="text-sm text-error">
                                    {payError}
                                </p>
                            )}
                            <p className="text-xs text-muted">{texts.payNote}</p>
                        </section>
                    )}
                </div>

                <aside className="flex flex-col gap-4">
                    <SideNote title={texts.feesTitle} text={texts.feesText} />
                    {stateKey !== 'active' && <SideNote title={texts.freeTitle} text={texts.freeText} />}
                </aside>
            </div>
        </div>
    )
}

const SummaryRow = ({ label, mono = false, children }: { label: string; mono?: boolean; children: ReactNode }) => (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
        <dt className="text-sm text-muted">{label}</dt>
        <dd className={`text-sm text-foreground ${mono ? 'font-mono' : ''}`}>{children}</dd>
    </div>
)

const SideNote = ({ title, text }: { title: string; text: string }) => (
    <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted">{text}</p>
    </div>
)

export default OrganizerPaidSalesPage
