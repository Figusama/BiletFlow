import { useForm } from 'react-hook-form'
import Button from '../components/ui/Button'
import FormField from '../components/ui/FormField'
import Input from '../components/ui/Input'

interface ResetPasswordFormData {
	password: string
	confirmPassword: string
}

const ResetPasswordPage = () => {
	const {
		register,
		handleSubmit,
		getValues,
		formState: { errors },
	} = useForm<ResetPasswordFormData>()

	const onSubmit = (data: ResetPasswordFormData) => {
		console.log(data)
	}

	return (
		<div className="min-h-[calc(100vh-4rem)] bg-background text-foreground">
			<div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center px-6 py-12">
				<div className="w-full max-w-md">
					<h1 className="text-3xl font-semibold tracking-tight">
						Reset your password
					</h1>

					<p className="mt-2 text-sm leading-6 text-muted">
						Enter a new password for your account.
					</p>

					<form
						noValidate
						onSubmit={handleSubmit(onSubmit)}
						className="mt-8 space-y-5"
					>
						<FormField
							label="New password"
							htmlFor="password"
							error={errors.password?.message}
							hint="Use at least 8 characters."
						>
							<Input
								id="password"
								type="password"
								autoComplete="new-password"
								placeholder="Enter a new password"
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

						<FormField
							label="Confirm password"
							htmlFor="confirmPassword"
							error={errors.confirmPassword?.message}
						>
							<Input
								id="confirmPassword"
								type="password"
								autoComplete="new-password"
								placeholder="Repeat your new password"
								hasError={Boolean(errors.confirmPassword)}
								{...register('confirmPassword', {
									required: 'Please confirm your password',
									validate: (value) =>
                                        value === getValues('password') || 'Passwords do not match',
								})}
							/>
						</FormField>

						<Button
							type="submit"
							fullWidth
						>
							Reset password
						</Button>
					</form>
				</div>
			</div>
		</div>
	)
}

export default ResetPasswordPage