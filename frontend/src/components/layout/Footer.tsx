import { Link } from 'react-router-dom'
import { useLanguage } from '../../shared/i18n/language'

const CURRENT_YEAR = new Date().getFullYear()

const Footer = () => {
    const { t } = useLanguage()

    const links = [
        { to: '/', label: t.nav.discover },
        { to: '/tickets', label: t.nav.myTickets },
        { to: '/organizer/events/new', label: t.nav.forOrganizers },
        { to: '/help', label: t.footer.help },
    ]

    return (
        <footer className="bg-night text-on-night">
            <div className="mx-auto max-w-[1224px] px-4 pt-16 pb-10 sm:px-6">
                <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                    <nav aria-label={t.nav.mainNavigation}>
                        <ul className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-semibold md:gap-x-16">
                            {links.map(({ to, label }) => (
                                <li key={to}>
                                    <Link to={to} className="hover:text-wordmark-tint">
                                        {label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    <p className="text-sm text-on-night/80">{t.footer.location}</p>
                </div>

                <div className="mt-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <p
                        aria-hidden="true"
                        className="text-6xl leading-none font-bold tracking-tight text-wordmark-tint md:text-[84px]"
                    >
                        BiletFlow
                    </p>

                    <p className="text-sm text-on-night/70">{t.footer.copyright(CURRENT_YEAR)}</p>
                </div>
            </div>
        </footer>
    )
}

export default Footer
