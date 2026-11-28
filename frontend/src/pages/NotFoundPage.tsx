import { Link } from 'react-router-dom'
import ErrorState, { primaryActionClass } from '../components/ui/ErrorState'
import { useLanguage } from '../shared/i18n/language'

const NotFoundPage = () => {
    const { t } = useLanguage()

    return (
        <ErrorState visual={<p className="text-7xl font-bold tracking-tight">404</p>} title={t.notFound.title} text={t.notFound.text}>
            <Link to="/" className={primaryActionClass}>
                {t.common.backToEvents}
            </Link>
        </ErrorState>
    )
}

export default NotFoundPage
