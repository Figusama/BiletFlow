import { useForm } from 'react-hook-form'
import Button from '../components/ui/Button'
import FormField from '../components/ui/FormField'
import Input from '../components/ui/Input'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../features/auth/auth'

interface ResetPasswordFormData {
	password: string
	confirmPassword: string
}

const ResetPasswordPage = () => {

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
			setSubmitError('Could not update your password. Please try again.')
		}
	}

	if (!token || status !== 'editing') {
		const updated = Boolean(token) && status === 'updated'

		return (
			<div className="auth-theme grid min-h-[calc(100dvh-4rem)] place-items-center bg-background px-4 py-8 text-foreground">
				<section className="flex min-h-[360px] w-full max-w-sm flex-col items-center justify-center rounded-2xl border border-[#e3dce7] bg-white p-6 text-center sm:p-8">
					<h1 className="text-2xl font-bold tracking-tight">
						{updated ? 'Password updated' : 'Invalid reset link'}
					</h1>

					<p className="mt-2 text-sm leading-6 text-muted">
						{updated
							? 'Sign in with your new password to continue.'
							: 'This link is invalid or has expired. Request a new reset link.'}
					</p>

					<Link
						to={updated ? '/login' : '/forgot-password'}
						className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-semibold text-white"
					>
						{updated ? 'Sign in' : 'Request a new link'}
					</Link>
				</section>
			</div>
		)
	}

	return (
		<div className="auth-theme grid min-h-[calc(100dvh-4rem)] place-items-center bg-background px-4 py-8 text-foreground">
			<section
				aria-labelledby="reset-password-title"
				className="w-full max-w-md rounded-[28px] border border-[#e3dce7] bg-white p-6 sm:p-8"
			>
				<h1
					id="reset-password-title"
					className="text-center text-2xl font-bold tracking-tight sm:text-[28px]"
				>
					Set a new password
				</h1>

				<p className="mt-2 text-center text-sm leading-6 text-muted">
					Choose a password you’ll use to sign in to BiletFlow.
				</p>

				<form
					noValidate
					onSubmit={handleSubmit(onSubmit)}
					className="mt-6 grid gap-5"
				>
					<FormField
						label="New password"
						htmlFor="new-password"
						hint="Use at least 8 characters."
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
								required: 'New password is required',
								minLength: {
									value: 8,
									message: 'Use at least 8 characters',
								},
								deps: ['confirmPassword'],
							})}
						/>
					</FormField>

					<FormField
						label="Repeat new password"
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
								required: 'Please repeat your new password',
								validate: (value) =>
									value === getValues('password') ||
									'Passwords do not match',
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
						className="min-h-12 bg-foreground! text-white"
					>
						{isSubmitting ? 'Updating…' : 'Update password'}
					</Button>
				</form>

				<Link
					to="/login"
					className="mx-auto mt-5 block w-fit text-sm font-semibold text-accent hover:underline"
				>
					Back to sign in
				</Link>
			</section>
		</div>
	)
}
export default ResetPasswordPage 