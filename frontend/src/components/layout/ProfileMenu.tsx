import { useCallback, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../shared/i18n/language'
import { useDismiss } from '../../shared/lib/useDismiss'
import { getInitials } from '../../shared/lib/initials'
import ThemeSelect from '../ui/ThemeSelect'

const itemClass =
    'block rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent'

interface ProfileMenuProps {
    fullName: string
    isAdmin?: boolean
    onLogout: () => void
}

const ProfileMenu = ({ fullName, isAdmin = false, onLogout }: ProfileMenuProps) => {
    const { t } = useLanguage()
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)
    const panelId = useId()

    const close = useCallback(() => setIsOpen(false), [])
    useDismiss(containerRef, isOpen, close)

    return (
        <div
            ref={containerRef}
            className="relative shrink-0"
            onBlur={(event) => {
                if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
                    setIsOpen(false)
                }
            }}
            onKeyDown={(event) => {
                if (event.key === 'Escape' && isOpen) {
                    setIsOpen(false)
                    buttonRef.current?.focus()
                }
            }}
        >
            <button
                ref={buttonRef}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setIsOpen((open) => !open)}
                aria-label={t.nav.profile}
                title={fullName}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-foreground hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
                {getInitials(fullName)}
            </button>

            <div
                id={panelId}
                hidden={!isOpen}
                className="absolute right-0 top-full z-20 mt-2 w-60 rounded-2xl border border-border bg-surface p-1.5 shadow-lg"
            >
                <p className="truncate border-b border-border px-3 pt-2 pb-3 text-sm font-semibold text-foreground">
                    {fullName}
                </p>
                <Link to="/tickets" onClick={() => setIsOpen(false)} className={`mt-1.5 ${itemClass}`}>
                    {t.nav.myTickets}
                </Link>
                <Link to="/support" onClick={() => setIsOpen(false)} className={itemClass}>
                    {t.buyerSupport.list.title}
                </Link>
                {isAdmin && (
                    <Link to="/admin" onClick={() => setIsOpen(false)} className={itemClass}>
                        {t.nav.admin}
                    </Link>
                )}
                <button type="button" onClick={onLogout} className={`${itemClass} w-full text-left`}>
                    {t.nav.logOut}
                </button>

                <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-border px-3 pt-3 pb-1.5">
                    <span className="text-sm text-muted">{t.theme.label}</span>
                    <ThemeSelect />
                </div>
            </div>
        </div>
    )
}

export default ProfileMenu