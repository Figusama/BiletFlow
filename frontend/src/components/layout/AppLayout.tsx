import { Outlet } from 'react-router-dom'
import Footer from './Footer'
import Header from './Header'

const AppLayout = () => {
	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground transition-colors duration-400 ease-out motion-reduce:transition-none">
			<Header />

			<main className="flex-1">
				<Outlet />
			</main>

			<Footer />
		</div>
	)
}

export default AppLayout
