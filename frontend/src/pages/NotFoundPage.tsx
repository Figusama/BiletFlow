import { Link } from 'react-router-dom'
import { useLanguage } from '../shared/i18n/language'

const NotFoundPage = () => {
	const { t } = useLanguage()
	return (
		<div className="min-h-[calc(100vh-4rem)] bg-background text-foreground">
			<div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center px-6 py-12">
				<div className="max-w-md text-center">
					<p className="text-sm font-semibold text-accent">
						404
					</p>

					<h1 className="mt-3 text-3xl font-semibold tracking-tight">
						{t.notFound.title}
					</h1>

					<p className="mt-3 text-sm leading-6 text-muted">
						{t.notFound.text}
					</p>

					<Link
						to="/"
						className="
							mt-7 inline-flex items-center justify-center
							rounded-lg bg-accent px-4 py-3
							text-sm font-semibold text-accent-foreground
							transition
							hover:opacity-90
							focus-visible:outline-none
							focus-visible:ring-2
							focus-visible:ring-accent
							focus-visible:ring-offset-2
							focus-visible:ring-offset-background
						"
					>
						{t.common.backToEvents}
					</Link>
				</div>
			</div>
		</div>
	)
}

export default NotFoundPage