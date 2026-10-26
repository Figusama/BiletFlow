import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import FormField from '../components/ui/FormField'

interface RegisterFormData {
	firstName: string
	lastName: string
	email: string
	password: string
}

const RegisterPage = () => {
	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<RegisterFormData>()

	const onSubmit = (data: RegisterFormData) => {
		console.log(data)
	}

	return (
		<div className="min-h-[calc(100vh-4rem)] bg-background text-foreground">
			<div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center px-6 py-12">
				<div className="w-full max-w-md">
					<h1 className="text-3xl font-semibold tracking-tight">
						Create your account
					</h1>

					<p className="mt-2 text-sm text-muted">
						Create an account to get tickets and manage your events.
					</p>

					<form
						noValidate
						onSubmit={handleSubmit(onSubmit)}
						className="mt-8 space-y-5"
					>
						<div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
							<FormField
								label="First name"
								htmlFor="firstName"
								error={errors.firstName?.message}
							>
								<Input
									id="firstName"
									type="text"
									autoComplete="given-name"
									placeholder="Ivan"
									hasError={Boolean(errors.firstName)}
									{...register('firstName', {
										required: 'First name is required',
										maxLength: {
											value: 100,
											message: 'Maximum 100 characters',
										},
									})}
								/>
							</FormField>

							<FormField
								label="Last name"
								htmlFor="lastName"
								error={errors.lastName?.message}
							>
								<Input
									id="lastName"
									type="text"
									autoComplete="family-name"
									placeholder="Ivanov"
									hasError={Boolean(errors.lastName)}
									{...register('lastName', {
										required: 'Last name is required',
										maxLength: {
											value: 100,
											message: 'Maximum 100 characters',
										},
									})}
								/>
							</FormField>
						</div>

						<FormField
							label="Email"
							htmlFor="register-email"
							error={errors.email?.message}
						>
							<Input
								id="register-email"
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

						<Button
							type="submit"
							fullWidth
						>
							Create account
						</Button>
					</form>

					<p className="mt-6 text-sm text-muted">
						Already have an account?{' '}
						<Link
							to="/login"
							className="font-medium text-accent hover:underline"
						>
							Log in
						</Link>
					</p>
				</div>
			</div>
		</div>
	)
}

export default RegisterPage