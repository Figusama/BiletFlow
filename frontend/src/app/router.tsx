import { createBrowserRouter } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import EventsPage from '../pages/EventsPage'
import NotFoundPage from '../pages/NotFoundPage'

export const router = createBrowserRouter([
    {
        path: '/',
		element: <AppLayout />,
		children: [
			{
				index: true,
				element: <EventsPage />,
			},
            {
                path: '*',
                element: <NotFoundPage />,
            },
		],
    },
])