import { createBrowserRouter } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import EventsPage from '../pages/EventsPage'
import NotFoundPage from '../pages/NotFoundPage'
import EventDetailsPage from '../pages/EventDetailsPage'
import TicketSelectionPage from '../pages/TicketSelectionPage'
import LoginPage from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'
import VerifyEmailPage from '../pages/VerifyEmailPage'
import ForgotPasswordPage from '../pages/ForgotPasswordPage'
import ResetPasswordPage from '../pages/ResetPasswordPage'
import MyTicketsPage from '../pages/MyTicketsPage'
import RequireAuth from '../features/auth/requireAuth'

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
                path: 'events/:eventId',
                element: <EventDetailsPage />,
            },
            {
                path: 'events/:eventId/tickets',
                element: <TicketSelectionPage />,
            },
			{
				path: 'login',
				element: <LoginPage />,
			},
			{
				path: 'register',
				element: <RegisterPage />
			},
            {
                path: 'auth/verify-email',
                element: <VerifyEmailPage />,
            },
            {
                path: 'forgot-password',
                element: <ForgotPasswordPage />,
            },
            {
                path: 'reset-password',
                element: <ResetPasswordPage />,
            },
            {
                element: <RequireAuth />,
                children: [
                    {
                        path: 'tickets',
                        element: <MyTicketsPage />,
                    },
                ],
            },
            {
                path: '*',
                element: <NotFoundPage />,
            },
		],
    },
])