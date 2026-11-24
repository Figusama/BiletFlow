import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useState } from 'react'
import { requestPasswordReset } from '../features/auth/auth'
import { useLanguage } from '../shared/i18n/language'
import Button from '../components/ui/Button'
import FormField from '../components/ui/FormField'
import Input from '../components/ui/Input'

interface ForgotPasswordFormData {
	email: string
}

const ForgotPasswordPage = () => {
	const { t } = useLanguage()
	const [requestAccepted, setRequestAccepted] = useState(false)
	const [submitError, setSubmitError] = useState('')

	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useForm<ForgotPasswordFormData>()

	const onSubmit = async (data: ForgotPasswordFormData) => {
		setSubmitError('')

		try {
			await requestPasswordReset(data.email.trim())
			setRequestAccepted(true)
		} catch {
			setSubmitError(t.forgotPassword.failed)
		}
	}

	return (
		<div className="grid min-h-[calc(100dvh-4rem)] place-items-center bg-background px-4 py-8 text-foreground">
			<section
				aria-labelledby="forgot-password-title"
				className="flex min-h-[360px] w-full max-w-md flex-col justify-center rounded-[28px] border border-border bg-surface p-6 sm:p-8"
			>
				<h1
					id="forgot-password-title"
					className="text-center text-2xl font-bold tracking-tight sm:text-[28px]"
				>
					{requestAccepted ? t.auth.checkInbox : t.forgotPassword.title}
				</h1>

				{requestAccepted ? (
					<p role="status" className="mt-3 text-center text-sm leading-6 text-muted">
						{t.forgotPassword.sent}
					</p>
				) : (
					<>
						<p className="mt-2 text-center text-sm leading-6 text-muted">
							{t.forgotPassword.subtitle}
						</p>

						<form
							noValidate
							onSubmit={handleSubmit(onSubmit)}
							className="mt-6 grid gap-5"
						>
							<FormField
								label={t.auth.email}
								htmlFor="forgot-email"
								error={errors.email?.message}
							>
								<Input
									id="forgot-email"
									type="email"
									autoComplete="email"
									placeholder={t.auth.emailPlaceholder}
									className="min-h-12"
									hasError={Boolean(errors.email)}
									aria-invalid={Boolean(errors.email)}
									{...register('email', {
										required: t.validation.emailRequired,
										pattern: {
											value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
											message: t.validation.emailInvalid,
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
								disabled={isSubmitting}
								variant="night"
								className="min-h-12"
							>
								{isSubmitting ? t.forgotPassword.submitting : t.forgotPassword.submit}
							</Button>
						</form>
					</>
				)}

				<Link
					to="/auth/token"
					className="mt-5 self-center text-sm font-semibold text-accent hover:underline"
				>
					{t.auth.backToSignIn}
				</Link>
			</section>
		</div>
	)
}

export default ForgotPasswordPage