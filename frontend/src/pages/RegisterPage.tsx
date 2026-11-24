import { Link } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import FormField from '../components/ui/FormField'
import PhoneInput from '../components/ui/PhoneInput'
import { validateKzMobilePhone } from '../shared/lib/phone'
import { useEffect, useState } from 'react'
import { registerAccount, type RegisterAccountInput } from '../features/auth/auth'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'


interface RegisterFormData {
    fullName: string
    email: string
    phone: string
    password: string
}

const RESEND_DELAY_SECONDS = 60

const RegisterPage = () => {
	const { t } = useLanguage()
	const [registeredEmail, setRegisteredEmail] = useState('')
	const [submitError, setSubmitError] = useState('')
	const [resendSeconds, setResendSeconds] = useState(0)
	const [lastSubmission, setLastSubmission] = useState<RegisterAccountInput | null>(null)

	useEffect(() => {
		if (resendSeconds === 0) return

		const timeoutId = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000)
		return () => window.clearTimeout(timeoutId)
	}, [resendSeconds])

	const sendRegistration = async (input: RegisterAccountInput) => {
		setSubmitError('')

		try {
			const result = await registerAccount(input)
			setLastSubmission(input)
			setRegisteredEmail(result.email)
			setResendSeconds(RESEND_DELAY_SECONDS)
			return true
		} catch (error) {
			const emailTaken = error instanceof ApiError && error.status === 409
			setSubmitError(emailTaken ? t.register.emailTaken : t.register.failed)
			return false
		}
	}

	const handleResend = () => {
		if (lastSubmission && resendSeconds === 0) {
			void sendRegistration(lastSubmission)
		}
	}

	const handleTryDifferentEmail = () => {
		setLastSubmission(null)
		setRegisteredEmail('')
		setResendSeconds(0)
	}

	const {
		register,
		control,
		handleSubmit,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<RegisterFormData>({
		mode: 'onBlur',
    	reValidateMode: 'onBlur',
	})


	const onSubmit = async (data: RegisterFormData) => {
		const sent = await sendRegistration({
			fullName: data.fullName.trim(),
			email: data.email.trim(),
			phone: `+${data.phone}`,
			password: data.password,
		})

		if (sent) reset()
	}

	return (
		<div className="min-h-[calc(100dvh-4rem)] bg-background px-4 pb-10 pt-4 text-foreground sm:px-6 md:pt-6">
			<div className="mx-auto grid max-w-[1224px] gap-3 md:grid-cols-[0.92fr_1fr] md:gap-6">
				<aside className="relative isolate flex min-h-[220px] items-end overflow-hidden rounded-[28px] bg-night p-6 text-white md:min-h-[744px] md:rounded-[36px] md:p-10">
					<img
						src="/jazz.png"
						alt=""
						className="absolute inset-0 -z-20 h-full w-full object-cover"
					/>
					<div
						aria-hidden="true"
						className="absolute inset-0 -z-10 bg-linear-to-t from-night-deep/90 via-transparent to-transparent"
					/>

					<div>
						<p className="text-[28px] leading-[1.05] font-bold tracking-tight md:text-[44px]">
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
					aria-labelledby="register-title"
					className="flex items-center rounded-[28px] border border-border bg-surface px-5 py-7 md:rounded-[36px] md:px-[clamp(24px,4.5vw,64px)] md:py-12"
				>
					<div className="w-full md:mx-auto md:max-w-md">
						
						{ registeredEmail ? ( 
							<>
								<h1 
									id="register-title"
            						className="text-2xl leading-tight font-bold tracking-tight md:text-[32px]"
								>
									{t.auth.checkInbox}
								</h1>

								<p className="mt-2 text-[15px] text-muted">
									{t.register.sentBefore}{' '}
									<strong className="break-all">{registeredEmail}</strong>{' '}
									{t.register.sentAfter}
								</p>

								<div className="mt-4">
									<Button
										type="button"
										shape="pill"
										disabled={resendSeconds > 0}
										onClick={handleResend}
									>
										{resendSeconds > 0
											? t.register.resendIn(resendSeconds)
											: t.register.resend}
									</Button>
								</div>

								<button
									type="button"
									onClick={handleTryDifferentEmail}
									className="mt-6 font-bold text-accent hover:underline"
								>
									{t.register.tryDifferentEmail}
								</button>
						    </>
						) : (
							<>
								<h1
									id="register-title"
									className="text-2xl leading-tight font-bold tracking-tight md:text-[32px]"
								>
									{t.register.title}
								</h1>
								<p className="mt-2 text-[15px] text-muted">
									{t.register.subtitle}
								</p>

								<form
									noValidate
									onSubmit={handleSubmit(onSubmit)}
									className="mt-6 grid gap-5"
								>
									<FormField label={t.register.fullName} htmlFor="full-name" error={errors.fullName?.message}>
										<Input
											id="full-name"
											autoComplete="name"
											placeholder={t.register.fullNamePlaceholder}
											className="min-h-12"
											hasError={Boolean(errors.fullName)}
											aria-invalid={Boolean(errors.fullName)}
											{...register('fullName', {
												validate: (value) => value.trim().length > 0 || t.validation.fullNameRequired,
											})}
										/>
									</FormField>

									<FormField
										label={t.auth.email}
										htmlFor="register-email"
										error={errors.email?.message}
									>
										<Input
											id="register-email"
											type="email"
											autoComplete="email"
											placeholder={t.auth.emailPlaceholder}
											className="min-h-12"
											hasError={Boolean(errors.email)}
											{...register('email', {
												required: t.validation.emailRequired,
												pattern: {
													value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
													message: t.validation.emailInvalid,
												},
											})}
										/>
									</FormField>

									<Controller
										name="phone"
										control={control}
										defaultValue=""
										rules={{
											required: t.validation.phoneRequired,
											validate: (value) => {
												const result = validateKzMobilePhone(value)
												return result === true || t.validation[result]
											},
										}}
										render={({ field, fieldState }) => (
											<FormField
												label={t.register.phone}
												htmlFor="register-phone"
												hint={t.register.phoneHint}
												error={fieldState.error?.message}
											>
												<PhoneInput
													id="register-phone"
													name={field.name}
													value={field.value}
													onChange={field.onChange}
													onBlur={field.onBlur}
													inputRef={field.ref}
													hasError={Boolean(fieldState.error)}
												/>
											</FormField>
										)}
									/>

									<FormField
										label={t.auth.password}
										htmlFor="register-password"
										error={errors.password?.message}
										hint={t.register.passwordHint}
									>
										<Input
											id="register-password"
											type="password"
											autoComplete="new-password"
											placeholder={t.register.passwordPlaceholder}
											className="min-h-12"
											hasError={Boolean(errors.password)}
											{...register('password', {
												required: t.validation.passwordRequired,
												minLength: {
													value: 8,
													message: t.validation.passwordMinLength,
												},
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
										variant="night"
										className="min-h-14 text-base!"
									    disabled={isSubmitting}
									>
										{isSubmitting ? t.register.submitting : t.register.submit}
									</Button>
								</form>

								<p className="mt-6 text-center text-[15px] text-muted">
									{t.register.haveAccount}{' '}
									<Link to="/login" className="font-bold text-accent hover:underline">
										{t.auth.signIn}
									</Link>
								</p>
							</>
						)}
					</div>
				</section>
			</div>
		</div>
	)
}

export default RegisterPage