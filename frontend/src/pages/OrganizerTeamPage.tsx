import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import FormField from '../components/ui/FormField'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import StatusBadge, { type BadgeIcon, type BadgeTone } from '../components/ui/StatusBadge'
import {
    inviteStaff,
    revokeStaffInvitation,
    revokeStaffRole,
    staffKey,
    useManagedEvent,
    useStaff,
    type ManagedEvent,
    type StaffInvitation,
    type StaffInvitationStatus,
    type StaffMember,
    type StaffRole,
} from '../features/organizer/api'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { getDateParts } from '../shared/lib/date'

const invitationBadge: Record<StaffInvitationStatus, { tone: BadgeTone; icon: BadgeIcon }> = {
    PENDING: { tone: 'warning', icon: 'clock' },
    ACCEPTED: { tone: 'success', icon: 'check-circle' },
    DECLINED: { tone: 'neutral', icon: 'x-circle' },
    REVOKED: { tone: 'neutral', icon: 'ban' },
    EXPIRED: { tone: 'neutral', icon: 'clock' },
}

const staffRoles: StaffRole[] = ['EVENT_ADMIN', 'EVENT_SUPPORT']

const initials = (name: string) =>
    name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('')

const OrganizerTeamPage = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event, isPending, isError } = useManagedEvent(eventId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !event) return <p className="text-muted">{t.organizerEvent.loadFailed}</p>

    return <Team key={event.id} event={event} />
}

interface PersonRow {
    key: string
    name: string
    publicId: string
    role: 'ORGANIZER' | StaffRole
    badge: { tone: BadgeTone; icon: BadgeIcon }
    statusLabel: string
    action: { label: string; run: () => Promise<unknown> } | null
}

const Team = ({ event }: { event: ManagedEvent }) => {
    const { t } = useLanguage()
    const texts = t.organizerTeam
    const queryClient = useQueryClient()
    const { data, isPending, isError } = useStaff(event.id)
    const [publicId, setPublicId] = useState('')
    const [role, setRole] = useState<StaffRole>('EVENT_SUPPORT')
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')

    const isClosed = event.status === 'CANCELLED' || event.status === 'COMPLETED'

    const shortDate = (iso: string) => {
        const { day, month } = getDateParts(new Date(iso), event.timezone)
        return `${day} ${t.dates.monthsShort[month]}`
    }

    const run = async (task: () => Promise<unknown>) => {
        setIsBusy(true)
        setError('')
        try {
            await task()
            await queryClient.invalidateQueries({ queryKey: staffKey(event.id) })
            return true
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 404) setError(texts.userNotFound)
            else if (caught instanceof ApiError && caught.status === 409) setError(texts.alreadyInvited)
            else if (caught instanceof ApiError && caught.status === 422) setError(texts.cannotInviteOrganizer)
            else setError(texts.actionFailed)
            return false
        } finally {
            setIsBusy(false)
        }
    }

    const submit = async (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        if (!publicId.trim()) {
            setError(texts.publicIdRequired)
            return
        }
        if (await run(() => inviteStaff(event.id, publicId.trim(), role))) setPublicId('')
    }

    const memberRows = (member: StaffMember): PersonRow[] =>
        member.roles.map((memberRole) => {
            const isOrganizer = memberRole === 'ORGANIZER'
            return {
                key: `${member.user_id}-${memberRole}`,
                name: member.full_name ?? member.public_id,
                publicId: member.public_id,
                role: memberRole as PersonRow['role'],
                badge: isOrganizer ? { tone: 'neutral', icon: 'check-circle' } : invitationBadge.ACCEPTED,
                statusLabel: isOrganizer ? texts.owner : texts.status.ACCEPTED,
                action:
                    isOrganizer || isClosed
                        ? null
                        : { label: texts.revoke, run: () => revokeStaffRole(event.id, member.user_id, memberRole as StaffRole) },
            }
        })

    const invitationRow = (invitation: StaffInvitation): PersonRow => {
        const label =
            invitation.status === 'PENDING'
                ? texts.pendingUntil(shortDate(invitation.expires_at))
                : invitation.status === 'DECLINED'
                  ? texts.declinedOn(shortDate(invitation.declined_at ?? invitation.created_at))
                  : texts.expiredOn(shortDate(invitation.expires_at))
        return {
            key: invitation.id,
            name: invitation.invited_user_name ?? invitation.invited_user_public_id,
            publicId: invitation.invited_user_public_id,
            role: invitation.invited_role,
            badge: invitationBadge[invitation.status],
            statusLabel: label,
            action: isClosed
                ? null
                : invitation.status === 'PENDING'
                  ? { label: texts.revokeInvitation, run: () => revokeStaffInvitation(event.id, invitation.id) }
                  : { label: texts.inviteAgain, run: () => inviteStaff(event.id, invitation.invited_user_public_id, invitation.invited_role) },
        }
    }

    const rows: PersonRow[] = data
        ? [
              ...data.members.flatMap(memberRows),
              ...data.invitations.filter((invitation) => invitation.status !== 'ACCEPTED' && invitation.status !== 'REVOKED').map(invitationRow),
          ]
        : []

    return (
        <div className="flex flex-col gap-6">
            <header>
                <p className="text-xs font-bold tracking-widest text-accent uppercase">{event.title}</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                <p className="mt-1 max-w-2xl text-sm text-muted">{texts.intro}</p>
            </header>

            {!isClosed && (
                <form onSubmit={submit} noValidate className="rounded-2xl border border-border bg-surface p-5">
                    <h2 className="text-lg font-semibold text-foreground">{texts.invite}</h2>
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                        <div className="w-full sm:w-56">
                            <FormField label={texts.publicId} htmlFor="staff-public-id">
                                <Input
                                    id="staff-public-id"
                                    value={publicId}
                                    placeholder="BF-U-XXXXXX"
                                    onChange={(changeEvent) => setPublicId(changeEvent.target.value)}
                                />
                            </FormField>
                        </div>
                        <div className="w-full sm:w-52">
                            <FormField label={texts.role} htmlFor="staff-role">
                                <Select
                                    value={role}
                                    ariaLabel={texts.role}
                                    fullWidth
                                    options={staffRoles.map((value) => ({ value, label: texts.roles[value] }))}
                                    onValueChange={setRole}
                                />
                            </FormField>
                        </div>
                        <Button type="submit" shape="pill" disabled={isBusy}>
                            {texts.send}
                        </Button>
                    </div>
                    <p className="mt-3 text-xs text-muted">{texts.sendHint}</p>
                    {error && (
                        <p role="alert" className="mt-3 text-sm text-error">
                            {error}
                        </p>
                    )}

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {staffRoles.map((value) => (
                            <div key={value} className="rounded-xl bg-surface-sunk p-4">
                                <p className="text-sm font-semibold text-foreground">{texts.roles[value]}</p>
                                <p className="mt-1 text-sm text-muted">{texts.roleHints[value]}</p>
                            </div>
                        ))}
                    </div>
                </form>
            )}

            {isPending ? (
                <div className="h-40 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <table className="w-full min-w-[640px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.person}</th>
                                <th className="px-5 py-3 font-semibold">{texts.role}</th>
                                <th className="px-5 py-3 font-semibold">{texts.statusColumn}</th>
                                <th className="px-5 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {rows.map((row) => (
                                <tr key={row.key}>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-3">
                                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
                                                {initials(row.name)}
                                            </span>
                                            <div>
                                                <p className="font-semibold text-foreground">{row.name}</p>
                                                <p className="text-xs text-muted">{row.publicId}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 text-foreground">{row.role === 'ORGANIZER' ? texts.organizer : texts.roles[row.role]}</td>
                                    <td className="px-5 py-3">
                                        <StatusBadge tone={row.badge.tone} icon={row.badge.icon}>
                                            {row.statusLabel}
                                        </StatusBadge>
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        {row.action && (
                                            <button
                                                type="button"
                                                disabled={isBusy}
                                                onClick={() => run(row.action!.run)}
                                                className="text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
                                            >
                                                {row.action.label}
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
        </div>
    )
}

export default OrganizerTeamPage
