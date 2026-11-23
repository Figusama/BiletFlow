import { Link } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import FormField from '../components/ui/FormField'
import PhoneInput from '../components/ui/PhoneInput'
import { validateKzMobilePhone } from '../shared/lib/phone'
import { useEffect, useState } from 'react'
import { registerAccount } from '../features/auth/auth'


interface RegisterFormData {
    fullName: string
    email: string
    phone: string
    password: string
}

const RESEND_DELAY_SECONDS = 60

const RegisterPage = () => {
	const [registeredEmail, setRegisteredEmail] = useState('')
	const [submitError, setSubmitError] = useState('')

	const [resendAt, setResendAt] = useState(0)
	const [resendSeconds, setResendSeconds] = useState(0)

	const startResendTimer = () => {
		setResendAt(Date.now() + RESEND_DELAY_SECONDS * 1000)
		setResendSeconds(RESEND_DELAY_SECONDS)
	}

	useEffect(() => {
		if (!registeredEmail || resendAt === 0) return

		const intervalId = window.setInterval(() => {
			const remaining = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000))
			setResendSeconds(remaining)

			if (remaining === 0) window.clearInterval(intervalId)
		}, 250)

		return () => window.clearInterval(intervalId)
	}, [registeredEmail, resendAt])

	const handleResend = () => {
		if (!registeredEmail || Date.now() < resendAt) return

		



		startResendTimer()
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
		setSubmitError('')

		try {
			const result = await registerAccount({
				fullName: data.fullName.trim(),
				email: data.email.trim(),
				phone: `+${data.phone}`,
				password: data.password,
			})

			reset()
			setRegisteredEmail(result.email)
			startResendTimer()
		} catch {
			setSubmitError('Could not create your account. Please try again.')
		}
	}



	return (
		<div className="auth-theme min-h-[calc(100dvh-4rem)] bg-background px-4 pb-10 pt-4 text-foreground sm:px-6 md:pt-6">
			<div className="mx-auto grid max-w-[1224px] gap-3 md:grid-cols-[0.92fr_1fr] md:gap-6">
				<aside className="relative isolate flex min-h-[220px] items-end overflow-hidden rounded-[28px] bg-foreground p-6 text-white md:min-h-[744px] md:rounded-[36px] md:p-10">
					<img
						src="/jazz.png"
						alt=""
						className="absolute inset-0 -z-20 h-full w-full object-cover"
					/>
					<div
						aria-hidden="true"
						className="absolute inset-0 -z-10 bg-linear-to-t from-[#0c1a1e]/90 via-transparent to-transparent"
					/>

					<div>
						<p className="text-[28px] leading-[1.05] font-bold tracking-tight md:text-[44px]">
							Every evening
							<br />
							in one ticket.
						</p>
						<p className="mt-3 hidden text-base leading-6 text-white/90 md:block">
							Concerts, theatre, stand-up and community nights.
							<br />
							Free events are always free to host.
						</p>
					</div>
				</aside>

				<section
					aria-labelledby="register-title"
					className="flex items-center rounded-[28px] border border-[#e3dce7] bg-white px-5 py-7 md:rounded-[36px] md:px-[clamp(24px,4.5vw,64px)] md:py-12"
				>
					<div className="w-full md:mx-auto md:max-w-md">
						
						{ registeredEmail ? ( 
							<>
								<h1 
									id="register-title"
            						className="text-2xl leading-tight font-bold tracking-tight md:text-[32px]"
								>
									Check your inbox
								</h1>

								<p className="mt-2 text-[15px] text-muted">
									Confirm your email at{' '}
									<strong className="break-all">{registeredEmail}</strong>{' '}
									to finish creating your account.
								</p>
								<Link
									to="/auth/verify-email?token=demo"
									className="mt-4 block font-bold text-accent hover:underline"
								>
									Open demo verification link
								</Link>

								<div className="mt-4">
									<Button
										type="button"
										shape="pill"
										disabled={resendSeconds > 0}
										onClick={handleResend}
									>
										{resendSeconds > 0
											? `Resend link in ${resendSeconds}s`
											: 'Resend link'}
									</Button>
								</div>

								<button
									type="button"
									onClick={() => setRegisteredEmail('')}
									className="mt-6 font-bold text-accent hover:underline"
								>
									Try a different email
								</button>
						    </>
						) : (
							<>
								<h1
									id="register-title"
									className="text-2xl leading-tight font-bold tracking-tight md:text-[32px]"
								>
									Create account
								</h1>
								<p className="mt-2 text-[15px] text-muted">
									One account to buy tickets and host events.
								</p>

								<form
									noValidate
									onSubmit={handleSubmit(onSubmit)}
									className="mt-6 grid gap-5"
								>
									<FormField label="Full name" htmlFor="full-name" error={errors.fullName?.message}>
										<Input
											id="full-name"
											autoComplete="name"
											placeholder="Aruzhan Serikova"
											className="min-h-12"
											hasError={Boolean(errors.fullName)}
											aria-invalid={Boolean(errors.fullName)}
											{...register('fullName', {
												validate: (value) => value.trim().length > 0 || 'Full name is required',
											})}
										/>
									</FormField>

									<FormField
										label="Email"
										htmlFor="register-email"
										error={errors.email?.message}
									>
										<Input
											id="register-email"
											type="email"
											autoComplete="email"
											placeholder="name@example.com"
											className="min-h-12"
											hasError={Boolean(errors.email)}
											{...register('email', {
												required: 'Email is required',
												pattern: {
													value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
													message: 'Enter a valid email address',
												},
											})}
										/>
									</FormField>

									<Controller
										name="phone"
										control={control}
										defaultValue=""
										rules={{
											required: 'Phone number is required',
											validate: validateKzMobilePhone,
										}}
										render={({ field, fieldState }) => (
											<FormField
												label="Phone number"
												htmlFor="register-phone"
												hint="For contact only."
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
										label="Password"
										htmlFor="register-password"
										error={errors.password?.message}
										hint="Use at least 8 characters."
									>
										<Input
											id="register-password"
											type="password"
											autoComplete="new-password"
											placeholder="Create a password"
											className="min-h-12"
											hasError={Boolean(errors.password)}
											{...register('password', {
												required: 'Password is required',
												minLength: {
													value: 8,
													message: 'Password must be at least 8 characters',
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
										className="min-h-14 bg-foreground! text-base! text-white"
									    disabled={isSubmitting}
									>
										{isSubmitting ? 'Creating account…' : 'Create account'}
									</Button>
								</form>

								<p className="mt-6 text-center text-[15px] text-muted">
									Already have an account?{' '}
									<Link to="/login" className="font-bold text-accent hover:underline">
										Sign in
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