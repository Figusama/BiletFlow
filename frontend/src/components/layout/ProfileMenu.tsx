import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../shared/i18n/language'

interface ProfileMenuProps {
    fullName: string
    onLogout: () => void
}

const ProfileMenu = ({ fullName, onLogout }: ProfileMenuProps) => {
    const { t } = useLanguage()
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)
    const panelId = useId()

    useEffect(() => {
        if (!isOpen) return

        const handlePointerDown = (event: PointerEvent) => {
            if (
                event.target instanceof Node &&
                !containerRef.current?.contains(event.target)
            ) {
                setIsOpen(false)
            }
        }

        document.addEventListener('pointerdown', handlePointerDown)
        return () => document.removeEventListener('pointerdown', handlePointerDown)
    }, [isOpen])

    return (
        <div
            ref={containerRef}
            className="relative min-w-0"
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
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
                className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-foreground hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent"
            >
                <span className="max-w-24 truncate sm:max-w-40">{fullName}</span>
                <span aria-hidden="true" className="text-muted">
                    {isOpen ? '▴' : '▾'}
                </span>
            </button>

            <div
                id={panelId}
                hidden={!isOpen}
                className="absolute right-0 top-full z-20 mt-2 w-44 rounded-xl border border-border bg-surface p-1.5 shadow-lg"
            >
                <Link
                    to="/tickets"
                    onClick={() => setIsOpen(false)}
                    className="block rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent"
                >
                    {t.nav.myTickets}
                </Link>

                <button
                    type="button"
                    onClick={onLogout}
                    className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-foreground hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent"
                >
                    {t.nav.logOut}
                </button>
            </div>
        </div>
    )
}

export default ProfileMenu