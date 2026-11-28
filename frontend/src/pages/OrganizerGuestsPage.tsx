import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import StatusBadge from '../components/ui/StatusBadge'
import Textarea from '../components/ui/Textarea'
import {
    privateInvitationsKey,
    sendPrivateInvitations,
    useManagedEvent,
    usePrivateInvitations,
    type ManagedEvent,
} from '../features/organizer/api'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { formatTime, getDateParts } from '../shared/lib/date'

const MAX_EMAILS = 100
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const parseEmails = (value: string) => [
    ...new Set(
        value
            .split(/[\s,;]+/)
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
    ),
]

const OrganizerGuestsPage = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event, isPending, isError } = useManagedEvent(eventId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !event) return <p className="text-muted">{t.organizerEvent.loadFailed}</p>

    return <Guests key={event.id} event={event} />
}

const Guests = ({ event }: { event: ManagedEvent }) => {
    const { t } = useLanguage()
    const texts = t.organizerGuests
    const queryClient = useQueryClient()
    const { data: invitations = [], isPending, isError } = usePrivateInvitations(event.id)
    const [value, setValue] = useState('')
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')

    const isClosed = event.status === 'CANCELLED' || event.status === 'COMPLETED'
    const isPrivate = event.visibility === 'PRIVATE'
    const emails = parseEmails(value)

    const formatDateTime = (iso: string) => {
        const date = new Date(iso)
        const { day, month } = getDateParts(date, event.timezone)
        return `${day} ${t.dates.monthsShort[month]}, ${formatTime(date, event.timezone)}`
    }

    const send = async (list: string[]) => {
        setIsBusy(true)
        setError('')
        try {
            await sendPrivateInvitations(event.id, list)
            await queryClient.invalidateQueries({ queryKey: privateInvitationsKey(event.id) })
            return true
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 409 ? texts.notPrivate : texts.actionFailed)
            return false
        } finally {
            setIsBusy(false)
        }
    }

    const submit = async (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        if (emails.length === 0) {
            setError(texts.emailsRequired)
            return
        }
        if (emails.length > MAX_EMAILS) {
            setError(texts.tooMany)
            return
        }
        const invalid = emails.filter((email) => !emailPattern.test(email))
        if (invalid.length > 0) {
            setError(texts.invalidEmails(invalid.join(', ')))
            return
        }
        if (await send(emails)) setValue('')
    }

    return (
        <div className="flex flex-col gap-6">
            <header>
                <p className="text-xs font-bold tracking-widest text-accent uppercase">{event.title}</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                <p className="mt-1 max-w-2xl text-sm text-muted">{texts.intro}</p>
            </header>

            {!isPrivate ? (
                <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">{texts.notPrivate}</p>
            ) : (
                <>
                    {isClosed ? (
                        <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">{texts.closed}</p>
                    ) : (
                        <form onSubmit={submit} noValidate className="rounded-2xl border border-border bg-surface p-5">
                            <h2 className="text-lg font-semibold text-foreground">{texts.invite}</h2>
                            <label htmlFor="guest-emails" className="mt-4 block text-xs font-semibold text-foreground">
                                {texts.emails}
                            </label>
                            <Textarea
                                id="guest-emails"
                                rows={4}
                                value={value}
                                hasError={Boolean(error)}
                                placeholder="name@example.com"
                                onChange={(changeEvent) => setValue(changeEvent.target.value)}
                                className="mt-2"
                            />
                            {error && (
                                <p role="alert" className="mt-2 text-sm text-error">
                                    {error}
                                </p>
                            )}
                            <div className="mt-4 flex flex-wrap items-center gap-4">
                                <Button type="submit" shape="pill" disabled={isBusy}>
                                    {texts.send(emails.length)}
                                </Button>
                                <p className="max-w-xl text-xs text-muted">{texts.sendHint}</p>
                            </div>
                        </form>
                    )}

                    {isPending ? (
                        <div className="h-40 animate-pulse rounded-2xl bg-surface-sunk" />
                    ) : isError ? (
                        <p className="text-muted">{texts.loadFailed}</p>
                    ) : invitations.length === 0 ? (
                        <p className="text-sm text-muted">{texts.empty}</p>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                            <table className="w-full min-w-[640px] text-left text-sm">
                                <thead>
                                    <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                        <th className="px-5 py-3 font-semibold">{texts.columns.email}</th>
                                        <th className="px-5 py-3 font-semibold">{texts.columns.sent}</th>
                                        <th className="px-5 py-3 font-semibold">{texts.columns.validUntil}</th>
                                        <th className="px-5 py-3 font-semibold">{texts.columns.status}</th>
                                        <th className="px-5 py-3 font-semibold">{texts.columns.tickets}</th>
                                        <th className="px-5 py-3" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {invitations.map((invitation) => (
                                        <tr key={invitation.id}>
                                            <td className="px-5 py-3 text-foreground">{invitation.invited_email}</td>
                                            <td className="px-5 py-3 whitespace-nowrap text-foreground">{formatDateTime(invitation.created_at)}</td>
                                            <td className="px-5 py-3 whitespace-nowrap text-foreground">{formatDateTime(invitation.expires_at)}</td>
                                            <td className="px-5 py-3">
                                                <StatusBadge
                                                    tone={invitation.is_active ? 'success' : 'neutral'}
                                                    icon={invitation.is_active ? 'check-circle' : 'clock'}
                                                >
                                                    {invitation.is_active ? texts.status.active : texts.status.expired}
                                                </StatusBadge>
                                            </td>
                                            <td className="px-5 py-3 text-foreground">{invitation.tickets_count > 0 ? invitation.tickets_count : '—'}</td>
                                            <td className="px-5 py-3 text-right">
                                                {!invitation.is_active && !isClosed && (
                                                    <button
                                                        type="button"
                                                        disabled={isBusy}
                                                        onClick={() => send([invitation.invited_email])}
                                                        className="text-sm font-medium whitespace-nowrap text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
                                                    >
                                                        {texts.sendNewLink}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <p className="text-xs text-muted">{texts.footnote}</p>
                </>
            )}
        </div>
    )
}

export default OrganizerGuestsPage
