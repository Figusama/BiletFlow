import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import StatusBadge from '../components/ui/StatusBadge'
import {
    adminCountersKey,
    adminPaymentsKey,
    paymentFilters,
    reconcilePayments,
    useAdminCounters,
    useAdminPayments,
    type AdminPayment,
    type PaymentFilter,
} from '../features/admin/api'
import { paymentBadge } from '../features/admin/paymentBadges'
import { formatDateTime } from '../features/organizer/changes'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'

const PAGE_SIZE = 20
const TIME_ZONE = 'Asia/Almaty'

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
    const { data: counters } = useAdminCounters()

    const payments = data?.items ?? []
    const total = data?.total ?? 0
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const overdue = counters?.payments_overdue ?? 0

    const reconcile = async () => {
        setIsReconciling(true)
        setNotice('')
        try {
            const { handled } = await reconcilePayments()
            setNotice(texts.reconciled(handled))
            await queryClient.invalidateQueries({ queryKey: adminPaymentsKey })
            await queryClient.invalidateQueries({ queryKey: adminCountersKey })
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

            {overdue > 0 && filter !== 'PROBLEMS' && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-badge-warning-bg px-4 py-3 text-sm text-badge-warning-fg">
                    <span className="font-semibold">{texts.overdueBanner(overdue)}</span>
                    <button
                        type="button"
                        onClick={() => {
                            setFilter('PROBLEMS')
                            setPage(0)
                        }}
                        className="font-semibold underline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                        {texts.showOverdue}
                    </button>
                </div>
            )}

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
                    <table className="w-full min-w-[820px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.columns.order}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.event}</th>
                                <th className="px-5 py-3 text-right font-semibold">{texts.columns.amount}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.status}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.nextCheck}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {payments.map((payment) => {
                                const badge = paymentBadge[payment.status]
                                return (
                                    <tr key={payment.id} className="align-top">
                                        <td className="px-5 py-3">
                                            <Link to={payment.id} className="font-mono text-xs font-semibold text-foreground hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
                                                {payment.order_number}
                                            </Link>
                                            <p className="mt-0.5 text-xs text-muted">{formatDateTime(payment.created_at, TIME_ZONE, t)}</p>
                                            {payment.is_simulated && <p className="text-xs text-muted">{texts.simulated}</p>}
                                        </td>
                                        <td className="px-5 py-3 text-foreground">
                                            {payment.event_title}
                                            <p className="mt-0.5 text-xs text-muted">{payment.buyer_name ?? payment.buyer_email}</p>
                                        </td>
                                        <td className="px-5 py-3 text-right font-semibold whitespace-nowrap text-foreground">{formatKzt(payment.amount_minor)}</td>
                                        <td className="px-5 py-3">
                                            <StatusBadge tone={badge.tone} icon={badge.icon}>
                                                {texts.status[payment.status]}
                                            </StatusBadge>
                                            {operation(payment) && <p className="mt-1 text-xs text-muted">{operation(payment)}</p>}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap text-foreground">{nextCheck(payment)}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {payments.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
                    <span>{texts.range(page * PAGE_SIZE + 1, page * PAGE_SIZE + payments.length, total)}</span>
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

export default AdminPaymentsPage
