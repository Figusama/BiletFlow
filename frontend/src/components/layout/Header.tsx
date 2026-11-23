import { useCallback, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, NavLink } from 'react-router-dom'

import type { RootState } from '../../app/store'
import { signedOut } from '../../features/auth/authSlice'
import { setAccessToken } from '../../shared/api/client'
import { useLanguage } from '../../shared/i18n/language'
import { useDismiss } from '../../shared/lib/useDismiss'
import Collapse from '../ui/Collapse'
import LanguageMenu from '../ui/LanguageMenu'
import ThemeSelect from '../ui/ThemeSelect'
import HeaderSearch from './HeaderSearch'
import MobileMenu from './MobileMenu'
import OrganizerPanel from './OrganizerPanel'
import ProfileMenu from './ProfileMenu'
import { mainLinks, navLinkClass } from './navigation'

type OpenMenu = 'organizers' | 'mobile' | null

const ORGANIZER_PANEL_ID = 'organizer-panel'
const MOBILE_MENU_ID = 'mobile-menu'

const Header = () => {
    const { user, status } = useSelector((state: RootState) => state.auth)
    const dispatch = useDispatch()
    const { t } = useLanguage()

    const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
    const headerRef = useRef<HTMLDivElement>(null)

    const closeMenu = useCallback(() => setOpenMenu(null), [])
    const toggleMenu = (menu: Exclude<OpenMenu, null>) =>
        setOpenMenu((current) => (current === menu ? null : menu))

    useDismiss(headerRef, openMenu !== null, closeMenu)

    const handleLogout = () => {
        setAccessToken(null)
        dispatch(signedOut())
        closeMenu()
    }

    const isMenuOpen = openMenu !== null

    return (
        <header className="relative z-40 px-4 pt-4 sm:px-6">
            <div className="relative mx-auto h-[66px] w-full max-w-[1090px]">
                <div
                    ref={headerRef}
                    className={`absolute inset-x-0 top-0 border border-border bg-surface transition-[border-radius,box-shadow] duration-200 ${
                        isMenuOpen ? 'rounded-[28px] shadow-lg' : 'rounded-[33px]'
                    }`}
                >
                    <div className="flex h-16 items-center justify-between gap-4 pr-3 pl-5 sm:pl-8">
                        <div className="flex shrink-0 items-center gap-8">
                            <Link
                                to="/"
                                onClick={closeMenu}
                                className="text-[22px] font-bold tracking-tight text-accent focus-visible:outline-2 focus-visible:outline-accent"
                            >
                                BiletFlow
                            </Link>

                            <nav aria-label={t.nav.mainNavigation} className="hidden items-center gap-1 lg:flex">
                                {mainLinks.map(({ to, labelKey }) => (
                                    <NavLink
                                        key={to}
                                        to={to}
                                        end
                                        onClick={closeMenu}
                                        className={({ isActive }) =>
                                            navLinkClass({ isActive: isActive && openMenu !== 'organizers' })
                                        }
                                    >
                                        {t.nav[labelKey]}
                                    </NavLink>
                                ))}

                                <button
                                    type="button"
                                    aria-expanded={openMenu === 'organizers'}
                                    aria-controls={ORGANIZER_PANEL_ID}
                                    onClick={() => toggleMenu('organizers')}
                                    className={navLinkClass({ isActive: openMenu === 'organizers' })}
                                >
                                    {t.nav.forOrganizers}
                                </button>
                            </nav>
                        </div>

                        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                            <HeaderSearch className="hidden max-w-44 min-w-28 flex-1 xl:block" />

                            <div className="hidden shrink-0 items-center gap-1 lg:flex">
                                <button type="button" className="rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap text-foreground hover:bg-accent-soft">
                                    {t.city.astana}
                                </button>
                                <LanguageMenu />
                            </div>

                            <div className="hidden shrink-0 xl:block">
                                <ThemeSelect />
                            </div>

                            {status === 'checking' ? (
                                <span role="status" className="px-3 text-sm whitespace-nowrap text-muted">
                                    {t.nav.checkingSession}
                                </span>
                            ) : user ? (
                                <ProfileMenu fullName={user.fullName} onLogout={handleLogout} />
                            ) : (
                                <Link
                                    to="/login"
                                    onClick={closeMenu}
                                    className="inline-flex h-10 shrink-0 items-center rounded-full bg-night px-6 whitespace-nowrap text-sm font-semibold text-on-night focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                >
                                    {t.nav.signIn}
                                </Link>
                            )}

                            <button
                                type="button"
                                aria-label={openMenu === 'mobile' ? t.nav.closeMenu : t.nav.openMenu}
                                aria-expanded={openMenu === 'mobile'}
                                aria-controls={MOBILE_MENU_ID}
                                onClick={() => toggleMenu('mobile')}
                                className="grid size-10 shrink-0 place-items-center rounded-full text-foreground hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent lg:hidden"
                            >
                                <svg
                                    aria-hidden="true"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    className="size-5"
                                >
                                    <path d={openMenu === 'mobile' ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <Collapse isOpen={openMenu === 'organizers'}>
                        <OrganizerPanel id={ORGANIZER_PANEL_ID} onNavigate={closeMenu} />
                    </Collapse>
                    <Collapse isOpen={openMenu === 'mobile'}>
                        <MobileMenu id={MOBILE_MENU_ID} onNavigate={closeMenu} />
                    </Collapse>
                </div>
            </div>
        </header>
    )
}

export default Header
