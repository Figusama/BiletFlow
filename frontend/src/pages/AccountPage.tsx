import { useState, type FormEvent } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import type { RootState } from '../app/store'
import Button from '../components/ui/Button'
import FormField from '../components/ui/FormField'
import Icon from '../components/ui/Icon'
import Input from '../components/ui/Input'
import PhoneInput from '../components/ui/PhoneInput'
import { updateProfile } from '../features/account/api'
import ChangePasswordDialog from '../features/account/components/ChangePasswordDialog'
import { useMyApplications } from '../features/applications/api'
import { signOut } from '../features/auth/auth'
import { signedIn, signedOut } from '../features/auth/authSlice'
import { useLanguage } from '../shared/i18n/language'
import { getInitials } from '../shared/lib/initials'
import { validateKzMobilePhone } from '../shared/lib/phone'

const navClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent ${isActive ? 'bg-accent-soft font-semibold text-accent' : 'text-foreground hover:bg-surface-sunk'}`

const AccountPage = () => {
    const { t } = useLanguage()
    const texts = t.account
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const user = useSelector((state: RootState) => state.auth.user)
    const { data: applications = [] } = useMyApplications()
    const [fullName, setFullName] = useState(user?.fullName ?? '')
    const [phone, setPhone] = useState('')
    const [errors, setErrors] = useState<{ fullName?: string; phone?: string }>({})
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
    const [copied, setCopied] = useState(false)
    const [isChangingPassword, setIsChangingPassword] = useState(false)

    if (!user) return null

    const isAdmin = user.role === 'PLATFORM_ADMIN'
    const isOrganizer = applications.length > 0
    const isDirty = fullName.trim() !== user.fullName || phone !== ''

    const copyId = async () => {
        try {
            await navigator.clipboard.writeText(user.publicId)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 2000)
        } catch {
            setCopied(false)
        }
    }

    const save = async (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        const found: typeof errors = {}
        if (!fullName.trim()) found.fullName = texts.profile.required
        if (phone) {
            const phoneCheck = validateKzMobilePhone(phone)
            if (phoneCheck !== true) found.phone = t.validation[phoneCheck]
        }
        setErrors(found)
        setMessage(null)
        if (Object.keys(found).length > 0) return
        setIsSaving(true)
        try {
            const updated = await updateProfile({ fullName: fullName.trim(), phone: phone ? `+${phone}` : null })
            dispatch(signedIn({ ...user, fullName: updated.full_name }))
            setFullName(updated.full_name)
            setPhone('')
            setMessage({ kind: 'ok', text: texts.profile.saved })
        } catch {
            setMessage({ kind: 'error', text: texts.profile.failed })
        } finally {
            setIsSaving(false)
        }
    }

    const logOut = async () => {
        await signOut()
        dispatch(signedOut())
        navigate('/auth/token')
    }

    const passwordChanged = async () => {
        setIsChangingPassword(false)
        await logOut()
    }

    return (
        <div className="mx-auto max-w-[1224px] px-4 pt-8 pb-16 sm:px-6">
            <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[200px_minmax(0,1fr)] md:items-start">
                <nav aria-label={texts.nav.label} className="rounded-2xl border border-border bg-surface p-2">
                    <NavLink to="/account" className={navClass} end>
                        {texts.nav.profile}
                    </NavLink>
                    <NavLink to="/tickets" className={navClass}>
                        {t.nav.myTickets}
                    </NavLink>
                    <NavLink to="/support" className={navClass}>
                        {t.buyerSupport.list.title}
                    </NavLink>
                    {isOrganizer && (
                        <NavLink to="/organizer/events" className={navClass}>
                            {texts.nav.myEvents}
                        </NavLink>
                    )}
                    {isAdmin && (
                        <NavLink to="/admin" className={navClass}>
                            {t.nav.admin}
                        </NavLink>
                    )}
                </nav>

                <div>
                    <header className="flex items-center gap-4">
                        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-accent text-xl font-bold text-accent-foreground">
                            {getInitials(user.fullName)}
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">{user.fullName}</h1>
                                {isAdmin && <span className="rounded-full bg-night px-2.5 py-0.5 text-xs font-semibold text-on-night">{texts.badges.admin}</span>}
                                {isOrganizer && <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">{texts.badges.organizer}</span>}
                            </div>
                            <p className="mt-1 flex items-center gap-3 text-sm text-muted">
                                <span className="font-mono text-xs">{user.publicId}</span>
                                <button
                                    type="button"
                                    onClick={copyId}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                                >
                                    <Icon name="copy" className="size-3.5" />
                                    {copied ? texts.copied : texts.copyId}
                                </button>
                            </p>
                            <p className="mt-1 text-xs text-muted">{texts.shareHint}</p>
                        </div>
                    </header>

                    <form onSubmit={save} noValidate className="mt-6 rounded-2xl border border-border bg-surface p-6">
                        <h2 className="text-lg font-bold text-foreground">{texts.profile.title}</h2>
                        <div className="mt-4 flex max-w-sm flex-col gap-4">
                            <FormField label={texts.profile.fullName} htmlFor="account-name" error={errors.fullName}>
                                <Input
                                    id="account-name"
                                    value={fullName}
                                    maxLength={200}
                                    hasError={Boolean(errors.fullName)}
                                    onChange={(changeEvent) => setFullName(changeEvent.target.value)}
                                />
                            </FormField>
                            <FormField label={texts.profile.phone} htmlFor="account-phone" error={errors.phone} hint={texts.profile.phoneHint}>
                                <PhoneInput
                                    id="account-phone"
                                    name="phone"
                                    value={phone}
                                    onChange={setPhone}
                                    onBlur={() => undefined}
                                    inputRef={() => undefined}
                                    hasError={Boolean(errors.phone)}
                                />
                            </FormField>
                            <FormField label={texts.profile.email} htmlFor="account-email" hint={texts.profile.emailHint}>
                                <Input id="account-email" value={user.email} disabled readOnly className="bg-surface-sunk" />
                            </FormField>
                        </div>

                        {message && (
                            <p role={message.kind === 'error' ? 'alert' : 'status'} className={`mt-4 text-sm ${message.kind === 'error' ? 'text-error' : 'text-badge-success-fg'}`}>
                                {message.text}
                            </p>
                        )}

                        <div className="mt-6 flex flex-wrap items-center gap-3">
                            {isDirty && (
                                <Button type="submit" shape="pill" disabled={isSaving}>
                                    {texts.profile.save}
                                </Button>
                            )}
                            <Button type="button" variant={isDirty ? 'secondary' : 'primary'} shape="pill" onClick={() => setIsChangingPassword(true)}>
                                {texts.password.open}
                            </Button>
                            <button
                                type="button"
                                onClick={logOut}
                                className="inline-flex h-11 items-center rounded-full border border-error px-6 text-sm font-semibold text-error hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent"
                            >
                                {t.nav.logOut}
                            </button>
                        </div>
                    </form>

                    <p className="mt-4 text-xs text-muted">
                        <Link to="/support/new?scope=platform" className="font-medium text-accent hover:underline">
                            {texts.helpLink}
                        </Link>
                    </p>
                </div>
            </div>

            {isChangingPassword && <ChangePasswordDialog onClose={(changed) => (changed ? void passwordChanged() : setIsChangingPassword(false))} />}
        </div>
    )
}

export default AccountPage
