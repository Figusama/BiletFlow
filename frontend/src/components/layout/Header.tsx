import { Link, NavLink } from 'react-router-dom'
import ThemeSelect from '../ui/ThemeSelect'

const Header = () => {
	return (
		<header className="bg-surface">
			<div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
				<div className="flex items-center gap-10">
					<Link
						to="/"
						className="
							text-xl font-bold tracking-tight text-foreground
							focus-visible:rounded-md
							focus-visible:outline-none
							focus-visible:ring-2
							focus-visible:ring-accent
							focus-visible:ring-offset-2
							focus-visible:ring-offset-surface
						"
					>
						Bilet<span className="text-accent">Flow</span>
					</Link>

					<nav
						aria-label="Main navigation"
						className="hidden items-center gap-1 sm:flex"
					>
						<NavLink
							to="/"
							className={({ isActive }) => `
								rounded-lg px-3 py-2 text-sm font-medium
								transition-colors
								focus-visible:outline-none
								focus-visible:ring-2
								focus-visible:ring-accent
								${isActive
									? 'bg-surface-raised text-foreground'
									: 'text-muted hover:bg-surface-raised hover:text-foreground'
								}
							`}
						>
							Events
						</NavLink>
					</nav>
				</div>

				<div className="flex items-center gap-2">
					<NavLink
						to="/tickets"
						className={({ isActive }) => `
							hidden rounded-lg px-3 py-2 text-sm font-medium
							transition-colors
							focus-visible:outline-none
							focus-visible:ring-2
							focus-visible:ring-accent
							sm:block
							${isActive
								? 'bg-surface-raised text-foreground'
								: 'text-muted hover:bg-surface-raised hover:text-foreground'
							}
						`}
					>
						My Tickets
					</NavLink>

					<ThemeSelect />

					<Link
						to="/login"
						className="
							rounded-lg bg-accent px-4 py-2
							text-sm font-semibold text-accent-foreground
							transition-opacity
							hover:opacity-90
							focus-visible:outline-none
							focus-visible:ring-2
							focus-visible:ring-accent
							focus-visible:ring-offset-2
							focus-visible:ring-offset-surface
						"
					>
						Log in
					</Link>
				</div>
			</div>
		</header>
	)
}

export default Header