import { Link } from 'react-router-dom'
import { useLanguage } from '../shared/i18n/language'
import type { Dictionary } from '../shared/i18n/dictionaries/en'

interface ComingSoonPageProps {
    titleKey: keyof Dictionary['organizer']
}

const ComingSoonPage = ({ titleKey }: ComingSoonPageProps) => {
    const { t } = useLanguage()

    return (
        <section className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-4 py-16 text-center">
            <div>
                <p className="text-xs font-bold tracking-widest text-accent uppercase">
                    {t.comingSoon.eyebrow}
                </p>
                <h1 className="mt-3 text-3xl font-bold text-foreground">{t.organizer[titleKey]}</h1>
                <p className="mt-3 text-muted">
                    {t.comingSoon.text}
                </p>

                <Link
                    to="/"
                    className="mt-8 inline-flex h-11 items-center rounded-full bg-night px-6 text-sm font-semibold text-on-night hover:opacity-90"
                >
                    {t.comingSoon.backToEvents}
                </Link>
            </div>
        </section>
    )
}

export default ComingSoonPage
