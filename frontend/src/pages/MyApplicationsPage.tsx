import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import StatusBadge from '../components/ui/StatusBadge'
import { useMyApplications, type Application, type ApplicationStatus } from '../features/applications/api'
import { applicationBadge } from '../features/applications/status'
import { formatEventTimeRange } from '../features/events/labels'
import { useLanguage } from '../shared/i18n/language'
import { isValidTimeZone } from '../shared/lib/date'

type Filter = 'all' | 'drafts' | 'review' | 'approved' | 'closed'

const FILTER_STATUSES: Record<Filter, ApplicationStatus[]> = {
    all: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
    drafts: ['DRAFT'],
    review: ['PENDING'],
    approved: ['APPROVED'],
    closed: ['REJECTED', 'WITHDRAWN'],
}

const filterClass = (isActive: boolean) =>
    `inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
        isActive ? 'bg-night text-on-night' : 'text-foreground hover:bg-surface-sunk'
    }`

const ApplicationRow = ({ application }: { application: Application }) => {
    const { t } = useLanguage()
    const badge = applicationBadge[application.status] ?? applicationBadge.DRAFT
    const { starts_at, ends_at, timezone } = application

    return (
        <Link
            to={`/organizer/applications/${application.id}`}
            className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-4 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
            <div className="min-w-0 flex-1">
                <p className="text-xs font-bold tracking-widest text-muted uppercase">{application.application_number}</p>
                <p className="mt-1 truncate font-semibold text-foreground">{application.title || t.myApplications.untitled}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-4 text-sm text-muted">
                    {starts_at && ends_at && timezone && isValidTimeZone(timezone) && <span>{formatEventTimeRange({ starts_at, ends_at, timezone }, t)}</span>}
                    {application.venue_name_snapshot && <span>{application.venue_name_snapshot}</span>}
                </p>
            </div>
            <StatusBadge tone={badge.tone} icon={badge.icon}>
                {t.application.status[application.status]}
            </StatusBadge>
            <Icon name="chevron-left" className="size-5 shrink-0 rotate-180 text-muted" />
        </Link>
    )
}

const MyApplicationsPage = () => {
    const { t } = useLanguage()
    const { data: applications = [], isPending, isError } = useMyApplications()
    const [filter, setFilter] = useState<Filter>('all')

    const countFor = (key: Filter) => applications.filter((item) => FILTER_STATUSES[key].includes(item.status)).length
    const shown = applications.filter((item) => FILTER_STATUSES[filter].includes(item.status))

    return (
        <div className="mx-auto max-w-[1176px] px-4 pt-8 pb-16 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{t.myApplications.title}</h1>
                <Link
                    to="/organizer/events/new"
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    <Icon name="plus" className="size-4" />
                    {t.myApplications.newApplication}
                </Link>
            </div>

            {applications.length > 0 && (
                <div role="group" aria-label={t.myApplications.title} className="mt-6 flex flex-wrap gap-1">
                    {(Object.keys(FILTER_STATUSES) as Filter[]).map((key) => (
                        <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={filterClass(filter === key)}>
                            {t.myApplications.filters[key]} {countFor(key)}
                        </button>
                    ))}
                </div>
            )}

            {isPending ? (
                <div className="mt-8 h-40 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="mt-8 text-muted">{t.myApplications.failed}</p>
            ) : applications.length === 0 ? (
                <p className="mt-8 rounded-2xl border border-dashed border-border py-12 text-center text-muted">{t.myApplications.empty}</p>
            ) : shown.length === 0 ? (
                <p className="mt-6 rounded-2xl border border-dashed border-border py-12 text-center text-muted">{t.myApplications.emptyFilter}</p>
            ) : (
                <div className="mt-6 flex flex-col gap-3">
                    {shown.map((application) => (
                        <ApplicationRow key={application.id} application={application} />
                    ))}
                </div>
            )}
        </div>
    )
}

export default MyApplicationsPage
