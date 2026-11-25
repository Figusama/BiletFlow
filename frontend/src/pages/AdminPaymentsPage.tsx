import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import StatusBadge, { type BadgeIcon, type BadgeTone } from '../components/ui/StatusBadge'
import { adminPaymentsKey, paymentFilters, reconcilePayments, useAdminPayments, type AdminPayment, type PaymentFilter, type PaymentStatus } from '../features/admin/api'
import { formatDateTime } from '../features/organizer/changes'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'

const PAGE_SIZE = 20
const TIME_ZONE = 'Asia/Almaty'

const paymentBadge: Record<PaymentStatus, { tone: BadgeTone; icon: BadgeIcon }> = {
    PENDING: { tone: 'warning', icon: 'clock' },
    AUTHORIZED: { tone: 'neutral', icon: 'clock' },
    CAPTURING: { tone: 'neutral', icon: 'clock' },
    SUCCEEDED: { tone: 'success', icon: 'check-circle' },
    FAILED: { tone: 'danger', icon: 'x-circle' },
    CANCELLED: { tone: 'neutral', icon: 'ban' },
}

const pagerButton =
    'flex size-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'

const AdminPaymentsPage = () => {
    const { t } = useLanguage()
    const texts = t.admin.payments
    const queryClient = useQueryClient()
    const [filter, setFilter] = useState<PaymentFilter>('ALL')
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(0)
    const [isReconciling, setIsReconciling] = useState(false)
    const [notice, setNotice] = useState('')
    const { data, isPending, isError } = useAdminPayments(filter, search, page, PAGE_SIZE)

    const payments = data?.slice(0, PAGE_SIZE) ?? []
    const hasNextPage = (data?.length ?? 0) > PAGE_SIZE

    const reconcile = async () => {
        setIsReconciling(true)
        setNotice('')
        try {
            const { handled } = await reconcilePayments()
            setNotice(texts.reconciled(handled))
            await queryClient.invalidateQueries({ queryKey: adminPaymentsKey })
        } catch {
            setNotice(texts.reconcileFailed)
        } finally {
            setIsReconciling(false)
        }
    }

    const nextCheck = (payment: AdminPayment) => {
        if (!payment.next_check_at) return '—'
        const text = formatDateTime(payment.next_check_at, TIME_ZONE, t)
        return payment.is_overdue ? <span className="text-badge-warning-fg">{texts.overdue(text)}</span> : text
    }

    const operation = (payment: AdminPayment) =>
        [payment.pending_operation && texts.operations[payment.pending_operation], payment.cancellation_reason && texts.reasons[payment.cancellation_reason]]
            .filter(Boolean)
            .join(', ')

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{t.admin.groups.commerce}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                </div>
                <Button variant="secondary" shape="pill" disabled={isReconciling} onClick={reconcile}>
                    {isReconciling ? texts.reconciling : texts.reconcile}
                </Button>
            </header>

            {notice && (
                <p role="status" className="text-sm text-muted">
                    {notice}
                </p>
            )}

            <form
                className="flex flex-wrap items-center gap-3"
                onSubmit={(submitEvent) => {
                    submitEvent.preventDefault()
                    setSearch(searchInput.trim())
                    setPage(0)
                }}
            >
                <div className="w-full max-w-sm">
                    <label htmlFor="payment-search" className="sr-only">
                        {texts.searchPlaceholder}
                    </label>
                    <Input id="payment-search" type="search" value={searchInput} placeholder={texts.searchPlaceholder} onChange={(changeEvent) => setSearchInput(changeEvent.target.value)} />
                </div>
                <Select
                    value={filter}
                    ariaLabel={texts.statusFilter}
                    options={paymentFilters.map((value) => ({ value, label: texts.filters[value] }))}
                    onValueChange={(value) => {
                        setFilter(value)
                        setPage(0)
                    }}
                />
            </form>

            {isPending ? (
                <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : payments.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty}</p>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <table className="w-full min-w-[760px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.columns.order}</th>
                                <th className="px-5 py-3 text-right font-semibold">{texts.columns.amount}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.status}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.nextCheck}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.created}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {payments.map((payment) => {
                                const badge = paymentBadge[payment.status]
                                return (
                                    <tr key={payment.id} className="align-top">
                                        <td className="px-5 py-3 font-mono text-xs whitespace-nowrap text-foreground">
                                            {payment.order_number}
                                            {payment.is_simulated && <p className="mt-1 font-sans text-muted">{texts.simulated}</p>}
                                        </td>
                                        <td className="px-5 py-3 text-right font-semibold whitespace-nowrap text-foreground">{formatKzt(payment.amount_minor)}</td>
                                        <td className="px-5 py-3">
                                            <StatusBadge tone={badge.tone} icon={badge.icon}>
                                                {texts.status[payment.status]}
                                            </StatusBadge>
                                            {operation(payment) && <p className="mt-1 text-xs text-muted">{operation(payment)}</p>}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap text-foreground">{nextCheck(payment)}</td>
                                        <td className="px-5 py-3 whitespace-nowrap text-muted">{formatDateTime(payment.created_at, TIME_ZONE, t)}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {payments.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
                    <span>{t.admin.applications.range(page * PAGE_SIZE + 1, page * PAGE_SIZE + payments.length)}</span>
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

export default AdminPaymentsPage
