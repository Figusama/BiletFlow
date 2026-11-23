import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useState } from 'react'
import { requestPasswordReset } from '../features/auth/auth'
import Button from '../components/ui/Button'
import FormField from '../components/ui/FormField'
import Input from '../components/ui/Input'

interface ForgotPasswordFormData {
	email: string
}

const ForgotPasswordPage = () => {
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
			setSubmitError('Could not send the reset request. Please try again.')
		}
	}

	return (
		<div className="auth-theme grid min-h-[calc(100dvh-4rem)] place-items-center bg-background px-4 py-8 text-foreground">
			<section
				aria-labelledby="forgot-password-title"
				className="flex min-h-[360px] w-full max-w-md flex-col justify-center rounded-[28px] border border-[#e3dce7] bg-white p-6 sm:p-8"
			>
				<h1
					id="forgot-password-title"
					className="text-center text-2xl font-bold tracking-tight sm:text-[28px]"
				>
					{requestAccepted ? 'Check your inbox' : 'Forgot password?'}
				</h1>

				{requestAccepted ? (
					<>
						<p role="status" className="mt-3 text-center text-sm leading-6 text-muted">
							If an account exists for that email, you’ll receive a link
							to reset your password.
						</p>

						<Link
							to="/reset-password?token=demo"
							className="mt-4 self-center text-sm font-medium text-accent underline underline-offset-4"
						>
							Open demo reset link
						</Link>
					</>
				) : (
					<>
						<p className="mt-2 text-center text-sm leading-6 text-muted">
							Enter the email you used to sign up.
						</p>

						<form
							noValidate
							onSubmit={handleSubmit(onSubmit)}
							className="mt-6 grid gap-5"
						>
							<FormField
								label="Email"
								htmlFor="forgot-email"
								error={errors.email?.message}
							>
								<Input
									id="forgot-email"
									type="email"
									autoComplete="email"
									placeholder="name@example.kz"
									className="min-h-12"
									hasError={Boolean(errors.email)}
									aria-invalid={Boolean(errors.email)}
									{...register('email', {
										required: 'Email is required',
										pattern: {
											value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
											message: 'Enter a valid email address',
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
								className="min-h-12 bg-foreground! text-white"
							>
								{isSubmitting ? 'Sending…' : 'Send reset link'}
							</Button>
						</form>
					</>
				)}

				<Link
					to="/login"
					className="mt-5 self-center text-sm font-semibold text-accent hover:underline"
				>
					Back to sign in
				</Link>
			</section>
		</div>
	)
}

export default ForgotPasswordPage