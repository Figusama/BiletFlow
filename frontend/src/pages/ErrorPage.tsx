import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import ErrorState, { primaryActionClass, secondaryActionClass } from '../components/ui/ErrorState'
import Icon from '../components/ui/Icon'
import { useLanguage } from '../shared/i18n/language'
import NotFoundPage from './NotFoundPage'

const ErrorPage = () => {
    const { t } = useLanguage()
    const error = useRouteError()

    if (isRouteErrorResponse(error) && error.status === 404) {
        return <NotFoundPage />
    }

    return (
        <ErrorState visual={<Icon name="x-circle" className="size-16" />} title={t.errorPage.title} text={t.errorPage.text}>
            <button type="button" onClick={() => window.location.reload()} className={primaryActionClass}>
                {t.errorPage.reload}
            </button>
            <Link to="/" className={secondaryActionClass}>
                {t.common.backToEvents}
            </Link>
        </ErrorState>
    )
}

export default ErrorPage
