import type { ReactNode } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import type { RootState } from '../app/store'
import { primaryActionClass, secondaryActionClass } from '../components/ui/ErrorState'
import { signOut } from '../features/auth/auth'
import { signedOut } from '../features/auth/authSlice'
import { usePrivateInvitation } from '../features/invitations/api'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'

const InvitationCard = ({ title, children }: { title: string; children: ReactNode }) => {
    const { t } = useLanguage()

    return (
        <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center px-4 py-16">
            <div className="w-full rounded-3xl border border-border bg-surface p-8">
                <p className="text-xs font-bold tracking-widest text-accent uppercase">{t.invitation.kicker}</p>
                <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
                {children}
            </div>
        </div>
    )
}

const InvitationPage = () => {
    const { t } = useLanguage()
    const { token } = useParams()
    const authStatus = useSelector((state: RootState) => state.auth.status)

    if (authStatus === 'checking') return <div className="mx-auto mt-16 h-48 max-w-xl animate-pulse rounded-3xl bg-surface-sunk" />

    if (authStatus === 'guest') {
        return (
            <InvitationCard title={t.invitation.guest.title}>
                <p className="mt-3 leading-6 text-muted">{t.invitation.guest.text}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                    <Link to="/auth/token" state={{ from: `/invitations/${token}` }} className={primaryActionClass}>
                        {t.invitation.guest.signIn}
                    </Link>
                    <Link to="/auth/register" className={secondaryActionClass}>
                        {t.invitation.guest.createAccount}
                    </Link>
                </div>
                <p className="mt-6 text-xs text-muted">{t.invitation.guest.note}</p>
            </InvitationCard>
        )
    }

    return <SignedInInvitation token={token} />
}

const SignedInInvitation = ({ token }: { token: string | undefined }) => {
    const { t } = useLanguage()
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const email = useSelector((state: RootState) => state.auth.user?.email ?? '')
    const { data, isPending, error } = usePrivateInvitation(token, true)

    const switchAccount = async () => {
        await signOut()
        dispatch(signedOut())
        navigate('/auth/token', { state: { from: `/invitations/${token}` } })
    }

    if (isPending && !error) return <div className="mx-auto mt-16 h-48 max-w-xl animate-pulse rounded-3xl bg-surface-sunk" />

    if (data) return <Navigate to={`/events/${data.event_id}`} replace />

    const status = error instanceof ApiError ? error.status : 0

    if (status === 410) {
        return (
            <InvitationCard title={t.invitation.expired.title}>
                <p className="mt-3 leading-6 text-muted">{t.invitation.expired.text}</p>
                <p className="mt-6 rounded-2xl bg-surface-sunk px-4 py-3 text-sm text-foreground">
                    {t.invitation.expired.ticketsBefore}
                    <Link to="/tickets" className="font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
                        {t.invitation.expired.myTickets}
                    </Link>
                    {t.invitation.expired.ticketsAfter}
                </p>
                <Link to="/" className={`${primaryActionClass} mt-6`}>
                    {t.invitation.goHome}
                </Link>
            </InvitationCard>
        )
    }

    if (status === 404) {
        return (
            <InvitationCard title={t.invitation.wrong.title}>
                <p className="mt-3 leading-6 text-muted">{t.invitation.wrong.text(email)}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                    <button type="button" onClick={switchAccount} className={primaryActionClass}>
                        {t.invitation.wrong.switchAccount}
                    </button>
                    <Link to="/" className={secondaryActionClass}>
                        {t.invitation.goHome}
                    </Link>
                </div>
                <p className="mt-6 text-xs text-muted">{t.invitation.wrong.note}</p>
            </InvitationCard>
        )
    }

    return (
        <InvitationCard title={t.invitation.failed.title}>
            <p className="mt-3 leading-6 text-muted">{t.invitation.failed.text}</p>
            <Link to="/" className={`${primaryActionClass} mt-6`}>
                {t.invitation.goHome}
            </Link>
        </InvitationCard>
    )
}

export default InvitationPage
