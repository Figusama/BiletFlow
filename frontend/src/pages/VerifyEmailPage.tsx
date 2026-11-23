import { Link, useSearchParams } from 'react-router-dom'
import { verifyEmail } from '../features/auth/auth'

const VerifyEmailPage = () => {
    const [searchParams] = useSearchParams()
    const token = searchParams.get('token') ?? ''
    const verified = verifyEmail(token)

    return (
        <main className="auth-theme grid min-h-[calc(100dvh-4rem)] place-items-center bg-background px-4 py-8 text-foreground">
            <section
                aria-labelledby="verify-email-title"
                className="flex min-h-[360px] w-full max-w-sm flex-col items-center justify-center rounded-2xl border border-[#e3dce7] bg-white p-6 text-center sm:p-8"
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

                <h1 id="verify-email-title" className="text-2xl font-bold tracking-tight">
                    {verified ? 'Email verified' : 'Invalid verification link'}
                </h1>

                <p className="mt-2 text-sm leading-6 text-muted">
                    {verified
                        ? 'Your email is verified. You can now sign in.'
                        : 'This link is invalid or has expired. Register again to request a new link.'}
                </p>

                <Link
                    to={verified ? '/login' : '/register'}
                    className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    {verified ? 'Sign in' : 'Back to registration'}
                </Link>
            </section>
        </main>
    )
}

export default VerifyEmailPage