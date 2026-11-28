import { useState } from 'react'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import type { RootState } from '../app/store'
import Icon from '../components/ui/Icon'
import StatusBadge from '../components/ui/StatusBadge'
import { reviewStatuses, useAdminApplications, waitingTime, type AdminApplication, type ReviewStatus } from '../features/admin/api'
import { useLanguage } from '../shared/i18n/language'
import { formatTime, getDateParts } from '../shared/lib/date'

const PAGE_SIZE = 20

const waitingText = (iso: string, texts: { units: Record<'day' | 'hour' | 'minute', string> }) => {
    const { value, unit } = waitingTime(iso)
    return `${value} ${texts.units[unit]}`
}

const pagerButton =
    'flex size-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'

const AdminApplicationsPage = () => {
    const { t } = useLanguage()
    const texts = t.admin.applications
    const myUserId = useSelector((state: RootState) => state.auth.user?.id)
    const [status, setStatus] = useState<ReviewStatus>('PENDING')
    const [page, setPage] = useState(0)
    const { data, isPending, isError } = useAdminApplications(status, page, PAGE_SIZE)

    const applications = data?.slice(0, PAGE_SIZE) ?? []
    const hasNextPage = (data?.length ?? 0) > PAGE_SIZE

    const shortDate = (iso: string, timeZone: string) => {
        const { day, month } = getDateParts(new Date(iso), timeZone)
        return `${day} ${t.dates.monthsShort[month]}`
    }

    const submittedAt = (iso: string) => {
        const date = new Date(iso)
        const { day, month } = getDateParts(date)
        return `${day} ${t.dates.monthsShort[month]}, ${formatTime(date)}`
    }

    const changeStatus = (value: ReviewStatus) => {
        setStatus(value)
        setPage(0)
    }

    const oldest = status === 'PENDING' && page === 0 ? applications[0]?.submitted_at : null

    const row = (application: AdminApplication) => {
        const isMine = application.applicant_user_id === myUserId
        return (
            <tr key={application.id} className="align-top">
                <td className="px-5 py-3 font-mono text-xs whitespace-nowrap text-muted">
                    <Link to={application.id} className="hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
                        {application.application_number}
                    </Link>
                </td>
                <td className="px-5 py-3">
                    <Link to={application.id} className="font-semibold text-foreground hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
                        {application.title}
                    </Link>
                    {isMine && (
                        <p className="mt-1">
                            <StatusBadge tone="neutral">{texts.yours}</StatusBadge>
                        </p>
                    )}
                    {application.responsible_name && <p className="mt-0.5 text-xs text-muted">{application.responsible_name}</p>}
                </td>
                <td className="px-5 py-3 text-foreground">{application.categories.map((category) => category.name).join(', ')}</td>
                <td className="px-5 py-3 whitespace-nowrap text-foreground">
                    {application.starts_at && application.timezone && shortDate(application.starts_at, application.timezone)}
                    <p className="text-xs text-muted">{application.venue_city_snapshot}</p>
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-foreground">
                    {application.submitted_at && submittedAt(application.submitted_at)}
                    {application.submitted_at && status === 'PENDING' && <p className="text-xs text-muted">{texts.waiting(waitingText(application.submitted_at, texts))}</p>}
                </td>
                <td className="px-5 py-3 text-foreground">{application.intends_paid_sales ? texts.yes : texts.no}</td>
            </tr>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{t.admin.groups.moderation}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                </div>
                <div role="tablist" aria-label={texts.title} className="flex flex-wrap gap-1 rounded-full border border-border bg-surface p-1">
                    {reviewStatuses.map((value) => (
                        <button
                            key={value}
                            type="button"
                            role="tab"
                            aria-selected={status === value}
                            onClick={() => changeStatus(value)}
                            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                                status === value ? 'bg-night text-on-night' : 'text-foreground hover:bg-surface-sunk'
                            }`}
                        >
                            {texts.tabs[value]}
                        </button>
                    ))}
                </div>
            </header>

            <p className="text-sm text-muted">
                {oldest ? texts.oldestWaiting(waitingText(oldest, texts)) : texts.sortedBy[status === 'PENDING' ? 'oldest' : 'status']}
            </p>

            {isPending ? (
                <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : applications.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty[status]}</p>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <table className="w-full min-w-[820px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.columns.id}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.event}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.category}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.date}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.submitted}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.paidSales}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">{applications.map(row)}</tbody>
                    </table>
                </div>
            )}

            {applications.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
                    <span>{texts.range(page * PAGE_SIZE + 1, page * PAGE_SIZE + applications.length)}</span>
                    <div className="flex items-center gap-2">
                        <button type="button" aria-label={texts.previousPage} disabled={page === 0} onClick={() => setPage(page - 1)} className={pagerButton}>
                            <Icon name="chevron-left" className="size-4" />
                        </button>
                        <span className="px-2 text-foreground">{page + 1}</span>
                        <button type="button" aria-label={texts.nextPage} disabled={!hasNextPage} onClick={() => setPage(page + 1)} className={pagerButton}>
                            <Icon name="chevron-left" className="size-4 rotate-180" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default AdminApplicationsPage
