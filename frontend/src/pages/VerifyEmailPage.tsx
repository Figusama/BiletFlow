import { Link, useLoaderData } from 'react-router-dom'
import { verifyEmail } from '../features/auth/auth'

const VerifyEmailPage = () => {
    const status = useLoaderData()
    const verified = status === 'verified'
    const unavailable = status === 'unavailable'

    return (
        <main className="grid min-h-[calc(100dvh-4rem)] place-items-center bg-background px-4 py-8 text-foreground">
            <section
                aria-labelledby="verify-email-title"
                className="flex min-h-[360px] w-full max-w-sm flex-col items-center justify-center rounded-2xl border border-border bg-surface p-6 text-center sm:p-8"
            >
                <div
                    aria-hidden="true"
                    className={`mx-auto mb-4 grid size-12 place-items-center rounded-full text-2xl font-semibold ${
                        verified
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-800'
                    }`}
                >
                    <img
                        src={verified ? '/email-verified.svg' : '/email-invalid.svg'}
                        alt="email verification result"
                        className="mb-5 size-12 object-contain"
                    />
                </div>

                {unavailable
                    ? 'Could not verify your email'
                    : verified ? 'Email verified' : 'Invalid verification link'}

                <p className="mt-2 text-sm leading-6 text-muted">
                    {unavailable
                        ? 'We could not check your link. Try opening it again.'
                        : verified
                            ? 'Your email is verified. You can now sign in.'
                            : 'This link is invalid or has expired. Register again to request a new link.'}
                </p>

                <Link
                    to={verified ? '/login' : '/register'}
                    className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-night px-6 text-sm font-semibold text-on-night hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    {verified ? 'Sign in' : 'Back to registration'}
                </Link>
            </section>
        </main>
    )
}

export default VerifyEmailPage