import { Link, NavLink } from 'react-router-dom'
import { useEvents } from '../../features/events/api'
import { useCity } from '../../features/events/city'
import { getCities } from '../../features/events/filters'
import { languageOptions, useLanguage } from '../../shared/i18n/language'
import ThemeSelect from '../ui/ThemeSelect'
import HeaderSearch from './HeaderSearch'
import { mainLinks, navLinkClass, organizerLinks } from './navigation'

const optionClass =
    'rounded-full px-2.5 py-1.5 text-muted aria-pressed:bg-accent-soft aria-pressed:text-foreground hover:text-foreground'

interface MobileMenuProps {
    id: string
    onNavigate: () => void
}

const MobileMenu = ({ id, onNavigate }: MobileMenuProps) => {
    const { language, setLanguage, t } = useLanguage()
    const { city, setCity } = useCity()
    const { data: events = [] } = useEvents()

    const cityOptions: { value: string | null; label: string }[] = [
        { value: null, label: t.city.all },
        ...getCities(events).map((name) => ({ value: name, label: t.city.names[name] ?? name })),
    ]

    return (
        <nav id={id} aria-label={t.nav.mobileNavigation} className="px-4 pt-2 pb-5 lg:hidden">
            <HeaderSearch onSearch={onNavigate} />

            <div className="mt-3 flex flex-col gap-1">
                {mainLinks.map(({ to, labelKey }) => (
                    <NavLink key={to} to={to} end onClick={onNavigate} className={navLinkClass}>
                        {t.nav[labelKey]}
                    </NavLink>
                ))}
            </div>

            <h2 className="mt-5 px-4 text-xs font-bold tracking-widest text-accent uppercase">
                {t.organizer.title}
            </h2>
            <ul className="mt-2 flex flex-col gap-1">
                {organizerLinks.map(({ to, labelKey }) => (
                    <li key={to}>
                        <Link
                            to={to}
                            onClick={onNavigate}
                            className="block rounded-full px-4 py-2 text-sm text-foreground hover:bg-accent-soft"
                        >
                            {t.organizer[labelKey]}
                        </Link>
                    </li>
                ))}
            </ul>

            <div className="mt-4 border-t border-border px-4 pt-4">
                <p className="text-sm font-semibold text-foreground">{t.city.label}</p>
                <div className="mt-2 flex flex-wrap gap-1 text-sm font-semibold">
                    {cityOptions.map(({ value, label }) => (
                        <button
                            key={value ?? 'all'}
                            type="button"
                            aria-pressed={value === city}
                            onClick={() => setCity(value)}
                            className={optionClass}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-4">
                <div className="flex items-center gap-1 text-sm font-semibold">
                    {languageOptions.map(({ value, short, name }) => (
                        <button
                            key={value}
                            type="button"
                            title={name}
                            aria-pressed={value === language}
                            onClick={() => setLanguage(value)}
                            className={optionClass}
                        >
                            {short}
                        </button>
                    ))}
                </div>

                <ThemeSelect />
            </div>
        </nav>
    )
}

export default MobileMenu
