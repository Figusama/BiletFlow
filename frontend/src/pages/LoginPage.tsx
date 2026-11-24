import { useForm } from 'react-hook-form'
import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import FormField from '../components/ui/FormField'
import { signIn } from '../features/auth/auth'
import { useLanguage } from '../shared/i18n/language'
import type { SignInInput } from '../features/auth/auth'
import { useDispatch } from 'react-redux'
import { signedIn } from '../features/auth/authSlice'


const LoginPage = () => {
    const navigate = useNavigate()
    const dispatch = useDispatch()
    const location = useLocation()
    const { t } = useLanguage()
    const from = location.state?.from
    const destination = typeof from === 'string' && from.startsWith('/') ? from : '/'
    const [ submitError, setSubmitError ] = useState('')

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<SignInInput>({
		mode: 'onBlur',
    	reValidateMode: 'onBlur',
	})

    const onSubmit = async (data: SignInInput) => {
        setSubmitError('')

        try{
            const result = await signIn(data)
            
            switch(result.status){
                case 'success':
                    dispatch(signedIn(result.user))
                    navigate(destination, { replace: true })
                    return
                case 'invalid_credentials':
                    setSubmitError(t.login.invalidCredentials)
                    return
                case 'email_verification_required':
                    setSubmitError(t.login.verifyFirst)
                    return
            }
        } catch {
            setSubmitError(t.login.failed)
        }
    }

	return (
        <div className="min-h-[calc(100dvh-4rem)] bg-background px-4 pt-4 md:pt-6 pb-10 text-foreground sm:px-6">
            <div className="mx-auto grid max-w-[1224px] gap-3 md:grid-cols-[0.92fr_1fr] md:gap-6">
                <aside className="relative isolate flex min-h-[220px] items-end overflow-hidden rounded-[28px] bg-night p-6 text-white md:min-h-[700px] md:rounded-[36px] md:p-10">
                    <img
                        src="/concert.png"
                        alt=""
                        className="absolute inset-0 -z-20 h-full w-full object-cover"
                    />
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 -z-10 bg-linear-to-t from-night-deep/90 via-transparent to-transparent"
                    />

                    <div>
                        <p className="mt-2 text-[28px] leading-[1.05] font-bold tracking-tight md:text-[44px]">
                            {t.auth.promoTitleLine1}
                            <br />
                            {t.auth.promoTitleLine2}
                        </p>
                        <p className="mt-3 hidden text-base leading-6 text-white/90 md:block">
                            {t.auth.promoTextLine1}
                            <br />
                            {t.auth.promoTextLine2}
                        </p>
                    </div>
                </aside>

                <section
                    aria-labelledby="login-title"
                    className="flex items-center rounded-[28px] border border-border bg-surface px-5 py-7 md:rounded-[36px] md:px-[clamp(24px,4.5vw,64px)] md:py-12"
                >
                    <div className="w-full md:mx-auto md:max-w-md">
                        <h1
                            id="login-title"
                            className="text-2xl leading-tight font-bold tracking-tight md:text-[32px]"
                        >
                            {t.auth.signIn}
                        </h1>
                        <p className="mt-2 text-[15px] text-muted">
                            {t.login.subtitle}
                        </p>

                        <form
                            noValidate
                            onSubmit={handleSubmit(onSubmit)}
                            onChange={() => setSubmitError('')}
                            className="mt-6 grid gap-5"
                        >
                            <FormField
                                label={t.auth.email}
                                htmlFor="login-email"
                                error={errors.email?.message}
                            >
                                <Input
                                    id="login-email"
                                    type="email"
                                    autoComplete="email"
                                    placeholder={t.auth.emailPlaceholder}
                                    hasError={Boolean(errors.email)}
                                    aria-invalid={Boolean(errors.email)}
                                    className="min-h-12 bg-surface text-foreground"
                                    {...register('email', {
                                        required: t.validation.emailRequired,
                                        pattern: {
                                            value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                                            message: t.validation.emailInvalid,
                                        },
                                    })}
                                />
                            </FormField>

                            <FormField
                                label={t.auth.password}
                                htmlFor="login-password"
                                error={errors.password?.message}
                                labelAction={
                                    <Link
                                        to="/forgot-password"
                                        className="text-[13px] font-semibold text-accent hover:underline"
                                    >
                                        {t.login.forgotPassword}
                                    </Link>
                                }
                            >
                                <Input
                                    id="login-password"
                                    type="password"
                                    autoComplete="current-password"
                                    hasError={Boolean(errors.password)}
                                    aria-invalid={Boolean(errors.password)}
                                    className="min-h-12 bg-surface text-foreground"
                                    {...register('password', {
                                        required: t.validation.passwordRequired,
                                    })}
                                />
                            </FormField>


                            {submitError && (
                                <p role="alert" className="text-sm font-medium text-error">
                                    {submitError}
                                </p>
                            )}
                             <Button
                                type="submit"
                                fullWidth
                                shape="pill"
                                disabled={isSubmitting}
                                variant="night"
                                className="min-h-14 text-base!"
                            >
                                {isSubmitting ? t.login.submitting : t.auth.signIn}
                            </Button>
                        </form>

                        <p className="mt-6 text-center text-[15px] text-muted">
                            {t.login.noAccount}{' '}
                            <Link
                                to="/register"
                                className="font-bold text-accent hover:underline"
                            >
                                {t.login.createAccount}
                            </Link>
                        </p>
                    </div>
                </section>
            </div>
        </div>
    )
}

export default LoginPage