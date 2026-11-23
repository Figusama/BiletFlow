import { Outlet } from 'react-router-dom'
import Header from './Header'

const AppLayout = () => {
	return (
		<div className="min-h-screen bg-background text-foreground transition-colors duration-400 ease-out motion-reduce:transition-none">
			<Header />

			<main>
				<Outlet />
			</main>
		</div>
	)
}

export default AppLayout