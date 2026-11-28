import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Button from '../components/ui/Button'
import StatusBadge, { type BadgeIcon, type BadgeTone } from '../components/ui/StatusBadge'
import { acceptStaffInvitation, declineStaffInvitation, myStaffInvitationsKey, useMyStaffInvitations, type MyStaffInvitation } from '../features/invitations/api'
import { formatDateTime } from '../features/organizer/changes'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { APP_TIME_ZONE } from '../shared/lib/date'

const badgeOf: Record<MyStaffInvitation['status'], { tone: BadgeTone; icon: BadgeIcon }> = {
    PENDING: { tone: 'warning', icon: 'clock' },
    ACCEPTED: { tone: 'success', icon: 'check-circle' },
    DECLINED: { tone: 'neutral', icon: 'x-circle' },
    REVOKED: { tone: 'neutral', icon: 'x-circle' },
    EXPIRED: { tone: 'neutral', icon: 'clock' },
}

const StaffInvitationsPage = () => {
    const { t } = useLanguage()
    const texts = t.staffInvitations
    const queryClient = useQueryClient()
    const { data, isPending, isError } = useMyStaffInvitations()
    const [busyId, setBusyId] = useState<string | null>(null)
    const [error, setError] = useState('')

    const invitations = data ?? []

    const answer = async (invitation: MyStaffInvitation, action: (id: string) => Promise<MyStaffInvitation>) => {
        setBusyId(invitation.id)
        setError('')
        try {
            await action(invitation.id)
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 409 ? texts.conflict : texts.failed)
        } finally {
            await queryClient.invalidateQueries({ queryKey: myStaffInvitationsKey })
            setBusyId(null)
        }
    }

    return (
        <div className="mx-auto max-w-[1224px] px-4 pt-8 pb-16 sm:px-6">
            <div className="mx-auto max-w-3xl">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                <p className="mt-2 text-sm text-muted">{texts.intro}</p>

                {error && (
                    <p role="alert" className="mt-4 text-sm text-error">
                        {error}
                    </p>
                )}

                <div className="mt-6 flex flex-col gap-3">
                    {isPending ? (
                        <div className="h-32 animate-pulse rounded-2xl bg-surface-sunk" />
                    ) : isError ? (
                        <p className="text-muted">{texts.loadFailed}</p>
                    ) : invitations.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty}</p>
                    ) : (
                        invitations.map((invitation) => {
                            const badge = badgeOf[invitation.status]
                            return (
                                <article key={invitation.id} className="rounded-2xl border border-border bg-surface p-5">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h2 className="font-semibold text-foreground">{invitation.event_title}</h2>
                                            <p className="mt-0.5 text-sm text-foreground">{t.organizerTeam.roles[invitation.invited_role]}</p>
                                        </div>
                                        <StatusBadge tone={badge.tone} icon={badge.icon}>
                                            {texts.status[invitation.status]}
                                        </StatusBadge>
                                    </div>
                                    <p className="mt-2 text-sm text-muted">{t.organizerTeam.roleHints[invitation.invited_role]}</p>
                                    {invitation.status === 'PENDING' && (
                                        <>
                                            <p className="mt-2 text-xs text-muted">{texts.expiresAt(formatDateTime(invitation.expires_at, APP_TIME_ZONE, t))}</p>
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                <Button shape="pill" disabled={busyId !== null} onClick={() => answer(invitation, acceptStaffInvitation)}>
                                                    {texts.accept}
                                                </Button>
                                                <Button variant="secondary" shape="pill" disabled={busyId !== null} onClick={() => answer(invitation, declineStaffInvitation)}>
                                                    {texts.decline}
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </article>
                            )
                        })
                    )}
                </div>
            </div>
        </div>
    )
}

export default StaffInvitationsPage
