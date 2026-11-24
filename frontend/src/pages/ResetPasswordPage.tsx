import { useForm } from 'react-hook-form'
import Button from '../components/ui/Button'
import FormField from '../components/ui/FormField'
import Input from '../components/ui/Input'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../features/auth/auth'
import { useLanguage } from '../shared/i18n/language'

interface ResetPasswordFormData {
	password: string
	confirmPassword: string
}

const ResetPasswordPage = () => {
	const { t } = useLanguage()

	const [searchParams] = useSearchParams()
	const token = searchParams.get('token') ?? ''
	const [status, setStatus] = useState<'editing' | 'updated' | 'invalid'>('editing')
	const [submitError, setSubmitError] = useState('')

	const {
		register,
		handleSubmit,
		getValues,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<ResetPasswordFormData>()

	const onSubmit = async (data: ResetPasswordFormData) => {
		setSubmitError('')

		try {
			const result = await resetPassword({
				token,
				newPassword: data.password,
			})

			reset()
			setStatus(result === 'success' ? 'updated' : 'invalid')
		} catch {
			setSubmitError(t.resetPassword.failed)
		}
	}

	if (!token || status !== 'editing') {
		const updated = Boolean(token) && status === 'updated'

		return (
			<div className="grid min-h-[calc(100dvh-4rem)] place-items-center bg-background px-4 py-8 text-foreground">
				<section className="flex min-h-[360px] w-full max-w-sm flex-col items-center justify-center rounded-2xl border border-border bg-surface p-6 text-center sm:p-8">
					<h1 className="text-2xl font-bold tracking-tight">
						{updated ? t.resetPassword.updatedTitle : t.resetPassword.invalidTitle}
					</h1>

					<p className="mt-2 text-sm leading-6 text-muted">
						{updated
							? t.resetPassword.updatedText
							: t.resetPassword.invalidText}
					</p>

					<Link
						to={updated ? '/login' : '/forgot-password'}
						className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-night px-6 text-sm font-semibold text-on-night"
					>
						{updated ? t.auth.signIn : t.resetPassword.requestNew}
					</Link>
				</section>
			</div>
		)
	}

	return (
		<div className="grid min-h-[calc(100dvh-4rem)] place-items-center bg-background px-4 py-8 text-foreground">
			<section
				aria-labelledby="reset-password-title"
				className="w-full max-w-md rounded-[28px] border border-border bg-surface p-6 sm:p-8"
			>
				<h1
					id="reset-password-title"
					className="text-center text-2xl font-bold tracking-tight sm:text-[28px]"
				>
					{t.resetPassword.title}
				</h1>

				<p className="mt-2 text-center text-sm leading-6 text-muted">
					{t.resetPassword.subtitle}
				</p>

				<form
					noValidate
					onSubmit={handleSubmit(onSubmit)}
					className="mt-6 grid gap-5"
				>
					<FormField
						label={t.resetPassword.newPassword}
						htmlFor="new-password"
						hint={t.register.passwordHint}
						error={errors.password?.message}
					>
						<Input
							id="new-password"
							type="password"
							autoComplete="new-password"
							className="min-h-12"
							hasError={Boolean(errors.password)}
							aria-invalid={Boolean(errors.password)}
							{...register('password', {
								required: t.validation.newPasswordRequired,
								minLength: {
									value: 8,
									message: t.validation.passwordMinLength,
								},
								deps: ['confirmPassword'],
							})}
						/>
					</FormField>

					<FormField
						label={t.resetPassword.repeatPassword}
						htmlFor="repeat-password"
						error={errors.confirmPassword?.message}
					>
						<Input
							id="repeat-password"
							type="password"
							autoComplete="new-password"
							className="min-h-12"
							hasError={Boolean(errors.confirmPassword)}
							aria-invalid={Boolean(errors.confirmPassword)}
							{...register('confirmPassword', {
								required: t.validation.repeatPasswordRequired,
								validate: (value) =>
									value === getValues('password') ||
									t.validation.passwordsDontMatch,
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
						{isSubmitting ? t.resetPassword.submitting : t.resetPassword.submit}
					</Button>
				</form>

				<Link
					to="/login"
					className="mx-auto mt-5 block w-fit text-sm font-semibold text-accent hover:underline"
				>
					{t.auth.backToSignIn}
				</Link>
			</section>
		</div>
	)
}
export default ResetPasswordPage 