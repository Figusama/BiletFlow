import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import FormField from '../components/ui/FormField'

interface LoginFormData {
	email: string
	password: string
}

const LoginPage = () => {
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<LoginFormData>()

    const onSubmit = (data: LoginFormData) => {
        console.log(data)
    }

	return (
		<div className="min-h-[calc(100vh-4rem)] bg-background text-foreground">
			<div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center px-6 py-12">
				<div className="w-full max-w-md">
					<h1 className="text-3xl font-semibold tracking-tight">
						Welcome back
					</h1>

					<p className="mt-2 text-sm text-muted">
						Log in to your BiletFlow account.
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

                        <FormField
                            label="Password"
                            htmlFor="password"
                            error={errors.password?.message}
                            labelAction={
                                <Link
                                    to="/forgot-password"
                                    className="
                                        text-sm font-medium text-accent
                                        hover:underline
                                        focus-visible:rounded-sm
                                        focus-visible:outline-none
                                        focus-visible:ring-2
                                        focus-visible:ring-accent
                                    "
                                >
                                    Forgot password?
                                </Link>
                            }
                        >
                            <Input
                                id="password"
                                type="password"
                                autoComplete="current-password"
                                placeholder="Enter your password"
                                hasError={Boolean(errors.password)}
                                {...register('password', {
                                    required: 'Password is required',
                                })}
                            />
                        </FormField>

                        <Button
                            type="submit"
                            fullWidth
                        >
                            Log in
                        </Button>
                    </form>

					<p className="mt-6 text-sm text-muted">
						Don't have an account?{' '}
						<Link
							to="/register"
							className="font-medium text-accent hover:underline"
						>
							Create an account
						</Link>
					</p>
				</div>
			</div>
		</div>
	)
}

export default LoginPage