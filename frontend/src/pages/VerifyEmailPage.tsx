import { Link, useLoaderData } from 'react-router-dom'
import { useLanguage } from '../shared/i18n/language'

const VerifyEmailPage = () => {
    const { t } = useLanguage()
    const status = useLoaderData()
    const verified = status === 'verified'
    const unavailable = status === 'unavailable'

    const title = unavailable
        ? t.verifyEmail.unavailableTitle
        : verified ? t.verifyEmail.verifiedTitle : t.verifyEmail.invalidTitle

    const text = unavailable
        ? t.verifyEmail.unavailableText
        : verified ? t.verifyEmail.verifiedText : t.verifyEmail.invalidText

    return (
        <main className="grid min-h-[calc(100dvh-4rem)] place-items-center bg-background px-4 py-8 text-foreground">
            <section
                aria-labelledby="verify-email-title"
                className="flex min-h-[360px] w-full max-w-sm flex-col items-center justify-center rounded-2xl border border-border bg-surface p-6 text-center sm:p-8"
            >
                <div
                    aria-hidden="true"
                    className={`mx-auto mb-4 grid size-12 place-items-center rounded-full ${
                        verified ? 'bg-success-soft' : 'bg-warning-soft'
                    }`}
                >
                    <img
                        src={verified ? '/email-verified.svg' : '/email-invalid.svg'}
                        alt=""
                        className="size-12 object-contain"
                    />
                </div>

                <h1 id="verify-email-title" className="text-xl font-bold tracking-tight">
                    {title}
                </h1>

                <p className="mt-2 text-sm leading-6 text-muted">
                    {text}
                </p>

                <Link
                    to={verified ? '/login' : '/register'}
                    className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-night px-6 text-sm font-semibold text-on-night hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    {verified ? t.auth.signIn : t.verifyEmail.backToRegistration}
                </Link>
            </section>
        </main>
    )
}

export default VerifyEmailPage
