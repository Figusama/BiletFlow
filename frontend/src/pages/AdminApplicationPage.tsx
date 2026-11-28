import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useSelector } from 'react-redux'
import { Link, useParams } from 'react-router-dom'
import type { RootState } from '../app/store'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import StatusBadge from '../components/ui/StatusBadge'
import Textarea from '../components/ui/Textarea'
import {
    adminApplicationsKey,
    approveApplication,
    rejectApplication,
    useAdminApplication,
    waitingTime,
    type AdminApplication,
} from '../features/admin/api'
import { useVenues } from '../features/applications/api'
import { applicationBadge } from '../features/applications/status'
import { formatDateTime } from '../features/organizer/changes'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { formatTime, getDateParts } from '../shared/lib/date'

const MIN_REJECT_COMMENT = 3

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="grid gap-1 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
        <dt className="text-sm text-muted">{label}</dt>
        <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
)

const AdminApplicationPage = () => {
    const { t } = useLanguage()
    const { applicationId } = useParams()
    const { data: application, isPending, isError } = useAdminApplication(applicationId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !application) return <p className="text-muted">{t.admin.applications.notFound}</p>

    return <Review key={application.id} application={application} />
}

const Review = ({ application }: { application: AdminApplication }) => {
    const { t } = useLanguage()
    const texts = t.admin.applications
    const queryClient = useQueryClient()
    const myUserId = useSelector((state: RootState) => state.auth.user?.id)
    const { data: venues = [] } = useVenues()
    const [confirmed, setConfirmed] = useState(false)
    const [comment, setComment] = useState('')
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')

    const timeZone = application.timezone ?? 'Asia/Almaty'
    const isPending = application.status === 'PENDING'
    const isMine = application.applicant_user_id === myUserId
    const canReview = isPending && !isMine
    const badge = applicationBadge[application.status]
    const venue = venues.find((item) => item.id === application.venue_id)

    const waiting = () => {
        if (!application.submitted_at) return null
        const { value, unit } = waitingTime(application.submitted_at)
        return texts.waiting(`${value} ${texts.units[unit]}`)
    }

    const when = () => {
        if (!application.starts_at || !application.ends_at) return '—'
        const start = new Date(application.starts_at)
        const { day, month, year, weekday } = getDateParts(start, timeZone)
        return `${t.dates.weekdaysShort[weekday]} ${day} ${t.dates.monthsShort[month]} ${year}, ${formatTime(start, timeZone)}–${formatTime(new Date(application.ends_at), timeZone)} ${timeZone}`
    }

    const run = async (action: () => Promise<AdminApplication>) => {
        setIsBusy(true)
        setError('')
        try {
            const updated = await action()
            queryClient.setQueryData([...adminApplicationsKey, 'detail', application.id], updated)
            await queryClient.invalidateQueries({ queryKey: [...adminApplicationsKey, 'list'] })
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 403) setError(texts.ownApplication)
            else if (caught instanceof ApiError && caught.status === 409) setError(texts.alreadyReviewed)
            else setError(texts.actionFailed)
            await queryClient.invalidateQueries({ queryKey: [...adminApplicationsKey, 'detail', application.id] })
        } finally {
            setIsBusy(false)
        }
    }

    const reject = (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        const text = comment.trim()
        if (text.length < MIN_REJECT_COMMENT) {
            setError(texts.rejectReasonRequired)
            return
        }
        void run(() => rejectApplication(application.id, text))
    }

    return (
        <div className="flex flex-col gap-6">
            <Link
                to="/admin/applications"
                className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
                <Icon name="chevron-left" className="size-4" />
                {texts.allApplications}
            </Link>

            <article className="rounded-2xl border border-border bg-surface p-6">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <StatusBadge tone={badge.tone} icon={badge.icon}>
                        {texts.status[application.status as keyof typeof texts.status]}
                    </StatusBadge>
                    <span className="font-mono text-xs text-muted">{application.application_number}</span>
                    {isPending && waiting() && <span className="text-muted">{waiting()}</span>}
                </div>

                <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">{application.title}</h1>
                {application.submitted_at && (
                    <p className="mt-1 text-sm text-muted">{texts.submittedAt(formatDateTime(application.submitted_at, timeZone, t))}</p>
                )}

                {application.images.length > 0 && (
                    <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {application.images.map((image) => (
                            <li key={image.id}>
                                <img src={image.url} alt="" className="aspect-square w-full rounded-2xl object-cover" />
                            </li>
                        ))}
                    </ul>
                )}

                <dl className="mt-6 flex flex-col gap-3">
                    <Row label={texts.fields.categories}>{application.categories.map((category) => category.name).join(', ') || '—'}</Row>
                    <Row label={texts.fields.venue}>
                        {[application.venue_name_snapshot, application.venue_address_snapshot, application.venue_city_snapshot].filter(Boolean).join(', ') || '—'}
                        {venue && `, ${texts.maxCapacity(venue.max_capacity)}`}
                    </Row>
                    <Row label={texts.fields.when}>{when()}</Row>
                    <Row label={texts.fields.format}>
                        {application.seating_mode ? t.organizerEvent.seating[application.seating_mode] : '—'}
                        {application.visibility && `, ${t.organizerEvent.visibility[application.visibility]}`}
                    </Row>
                    <Row label={texts.fields.paidSales}>{application.intends_paid_sales ? texts.yes : texts.no}</Row>
                    <Row label={texts.fields.responsible}>
                        {[application.responsible_name, application.responsible_email, application.responsible_phone].filter(Boolean).join(', ') || '—'}
                    </Row>
                    <Row label={texts.fields.agreements}>
                        {application.agreements.length === 0 ? (
                            '—'
                        ) : (
                            <ul className="flex flex-col gap-1">
                                {application.agreements.map((agreement) => (
                                    <li key={agreement.document_type}>
                                        {texts.agreementTypes[agreement.document_type]} {agreement.document_version},{' '}
                                        {texts.acceptedAt(formatDateTime(agreement.accepted_at, timeZone, t))}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Row>
                </dl>

                <section className="mt-6 rounded-2xl bg-surface-sunk p-5">
                    <h2 className="text-sm font-semibold text-foreground">{texts.fields.description}</h2>
                    <p className="mt-2 text-sm whitespace-pre-line text-foreground">{application.description}</p>
                </section>

                <div className="mt-6 border-t border-border pt-6">
                    {canReview ? (
                        <div className="grid gap-8 md:grid-cols-2">
                            <div>
                                <h2 className="text-lg font-bold text-foreground">{texts.approve}</h2>
                                <label className="mt-3 flex items-start gap-3 text-sm text-foreground">
                                    <input
                                        type="checkbox"
                                        checked={confirmed}
                                        onChange={(changeEvent) => setConfirmed(changeEvent.target.checked)}
                                        className="mt-0.5 size-4 shrink-0 accent-accent"
                                    />
                                    {texts.confirmReview}
                                </label>
                                <Button
                                    className="mt-4"
                                    shape="pill"
                                    disabled={!confirmed || isBusy}
                                    onClick={() => run(() => approveApplication(application.id))}
                                >
                                    {texts.approveButton}
                                </Button>
                                <p className="mt-2 text-xs text-muted">{texts.approveHint}</p>
                            </div>
                            <form onSubmit={reject} noValidate>
                                <h2 className="text-lg font-bold text-foreground">{texts.reject}</h2>
                                <label htmlFor="reject-comment" className="sr-only">
                                    {texts.reject}
                                </label>
                                <Textarea
                                    id="reject-comment"
                                    rows={3}
                                    value={comment}
                                    maxLength={2000}
                                    placeholder={texts.rejectPlaceholder}
                                    onChange={(changeEvent) => setComment(changeEvent.target.value)}
                                    className="mt-3 min-h-24"
                                />
                                <Button type="submit" variant="secondary" shape="pill" className="mt-3" disabled={isBusy}>
                                    {texts.rejectButton}
                                </Button>
                            </form>
                        </div>
                    ) : (
                        <>
                            {isPending && isMine && <p className="text-sm text-muted">{texts.ownApplication}</p>}
                            {!isPending && (
                                <div>
                                    <h2 className="text-lg font-bold text-foreground">
                                        {texts.status[application.status as keyof typeof texts.status]}
                                    </h2>
                                    {application.reviewed_at && (
                                        <p className="mt-1 text-sm text-muted">{texts.reviewedAt(formatDateTime(application.reviewed_at, timeZone, t))}</p>
                                    )}
                                    {application.review_comment && <p className="mt-3 text-sm whitespace-pre-line text-foreground">{application.review_comment}</p>}
                                </div>
                            )}
                        </>
                    )}
                    {error && (
                        <p role="alert" className="mt-4 text-sm text-error">
                            {error}
                        </p>
                    )}
                </div>
            </article>
        </div>
    )
}

export default AdminApplicationPage
