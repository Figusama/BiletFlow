import { Link } from 'react-router-dom'
import { useLanguage } from '../../shared/i18n/language'
import { organizerLinks } from './navigation'

interface OrganizerPanelProps {
    id: string
    onNavigate: () => void
}

const OrganizerPanel = ({ id, onNavigate }: OrganizerPanelProps) => {
    const { t } = useLanguage()
    const [mainLink, ...otherLinks] = organizerLinks

    return (
        <section
            id={id}
            aria-label={t.organizer.title}
            className="grid grid-cols-2 gap-8 px-8 pt-4 pb-8 max-lg:hidden"
        >
            <div>
                <h2 className="text-xs font-bold tracking-widest text-accent uppercase">
                    {t.organizer.title}
                </h2>

                <ul className="mt-4 space-y-3">
                    <li>
                        <Link
                            to={mainLink.to}
                            onClick={onNavigate}
                            className="text-lg font-semibold text-foreground hover:text-accent"
                        >
                            {t.organizer[mainLink.labelKey]}
                        </Link>
                    </li>

                    {otherLinks.map(({ to, labelKey }) => (
                        <li key={to}>
                            <Link
                                to={to}
                                onClick={onNavigate}
                                className="text-[15px] text-foreground hover:text-accent"
                            >
                                {t.organizer[labelKey]}
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="rounded-3xl bg-accent-soft p-8">
                <h3 className="text-2xl font-bold text-foreground">
                    {t.organizer.promoTitle}
                </h3>
                <p className="mt-2 text-sm text-muted">
                    {t.organizer.promoText}
                </p>

                <Link
                    to={mainLink.to}
                    onClick={onNavigate}
                    className="mt-6 inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
                >
                    {t.organizer.createEvent}
                </Link>
            </div>
        </section>
    )
}

export default OrganizerPanel
