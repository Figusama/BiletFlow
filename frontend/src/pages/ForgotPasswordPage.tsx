import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import Button from '../components/ui/Button'
import FormField from '../components/ui/FormField'
import Input from '../components/ui/Input'

interface ForgotPasswordFormData {
	email: string
}

const ForgotPasswordPage = () => {
	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<ForgotPasswordFormData>()

	const onSubmit = (data: ForgotPasswordFormData) => {
		console.log(data)
	}

	return (
		<div className="min-h-[calc(100vh-4rem)] bg-background text-foreground">
			<div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center px-6 py-12">
				<div className="w-full max-w-md">
					<h1 className="text-3xl font-semibold tracking-tight">
						Forgot your password?
					</h1>

					<p className="mt-2 text-sm leading-6 text-muted">
						Enter your email address and we'll send you a link to reset your
						password.
					</p>

					<form
						noValidate
						onSubmit={handleSubmit(onSubmit)}
						className="mt-8 space-y-5"
					>
						<FormField
							label="Email"
							htmlFor="email"
							error={errors.email?.message}
						>
							<Input
								id="email"
								type="email"
								autoComplete="email"
								placeholder="you@example.com"
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

						<Button
							type="submit"
							fullWidth
						>
							Send reset link
						</Button>
					</form>

					<p className="mt-6 text-sm text-muted">
						<Link
							to="/login"
							className="font-medium text-accent hover:underline"
						>
							Back to login
						</Link>
					</p>
				</div>
			</div>
		</div>
	)
}

export default ForgotPasswordPage