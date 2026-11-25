import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import StatusBadge from '../components/ui/StatusBadge'
import { activationFilters, useAdminActivations, type ActivationFilter } from '../features/admin/api'
import { activationBadge } from '../features/admin/activationBadges'
import { formatDateTime } from '../features/organizer/changes'
import { usePaidSalesTerms } from '../features/organizer/api'
import { useLanguage } from '../shared/i18n/language'
import { formatKzt } from '../shared/lib/money'

const PAGE_SIZE = 20
const TIME_ZONE = 'Asia/Almaty'

const pagerButton =
    'flex size-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'

const AdminActivationsPage = () => {
    const { t } = useLanguage()
    const texts = t.admin.activations
    const [status, setStatus] = useState<ActivationFilter>('ALL')
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(0)
    const { data, isPending, isError } = useAdminActivations(status, search, page, PAGE_SIZE)
    const { data: terms } = usePaidSalesTerms()

    const activations = data?.items ?? []
    const total = data?.total ?? 0
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{t.admin.groups.moderation}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                </div>
                {terms && <p className="text-sm text-muted">{texts.fee(formatKzt(terms.fee_amount_minor))}</p>}
            </header>

            <form
                className="flex flex-wrap items-center gap-3"
                onSubmit={(submitEvent) => {
                    submitEvent.preventDefault()
                    setSearch(searchInput.trim())
                    setPage(0)
                }}
            >
                <div className="w-full max-w-sm">
                    <label htmlFor="activation-search" className="sr-only">
                        {texts.searchPlaceholder}
                    </label>
                    <Input id="activation-search" type="search" value={searchInput} placeholder={texts.searchPlaceholder} onChange={(changeEvent) => setSearchInput(changeEvent.target.value)} />
                </div>
                <Select
                    value={status}
                    ariaLabel={texts.statusFilter}
                    options={activationFilters.map((value) => ({ value, label: texts.filters[value] }))}
                    onValueChange={(value) => {
                        setStatus(value)
                        setPage(0)
                    }}
                />
            </form>

            {isPending ? (
                <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : activations.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty}</p>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <table className="w-full min-w-[760px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.columns.event}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.organizer}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.fee}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.status}</th>
                                <th className="px-5 py-3 font-semibold" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {activations.map((activation) => {
                                const badge = activationBadge[activation.status]
                                const target = activation.pending_request_id ? `${activation.pending_request_id}?status=PENDING` : `events/${activation.event_id}`
                                return (
                                    <tr key={activation.event_id} className="align-top">
                                        <td className="px-5 py-3">
                                            <Link to={`events/${activation.event_id}`} className="font-semibold text-foreground hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
                                                {activation.event_title}
                                            </Link>
                                            <p className="mt-0.5 font-mono text-xs text-muted">{activation.event_public_id}</p>
                                        </td>
                                        <td className="px-5 py-3 text-foreground">{activation.organizer_name ?? activation.organizer_email ?? '—'}</td>
                                        <td className="px-5 py-3 whitespace-nowrap text-foreground">
                                            {activation.fee_paid_at ? texts.paidOn(formatDateTime(activation.fee_paid_at, TIME_ZONE, t)) : '—'}
                                        </td>
                                        <td className="px-5 py-3">
                                            <StatusBadge tone={badge.tone} icon={badge.icon}>
                                                {texts.activationStatus[activation.status]}
                                            </StatusBadge>
                                            {activation.status === 'SUSPENDED' && (
                                                <p className="mt-1 text-xs text-muted">
                                                    {[activation.suspension_reason, activation.suspended_at && formatDateTime(activation.suspended_at, TIME_ZONE, t)].filter(Boolean).join(', ')}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-right whitespace-nowrap">
                                            <Link to={target} className="font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
                                                {activation.pending_request_id ? texts.review : texts.inspect}
                                            </Link>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {activations.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
                    <span>{t.admin.payments.range(page * PAGE_SIZE + 1, page * PAGE_SIZE + activations.length, total)}</span>
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

export default AdminActivationsPage
