import { createBrowserRouter } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import EventsPage from '../pages/EventsPage'
import NotFoundPage from '../pages/NotFoundPage'
import ComingSoonPage from '../pages/ComingSoonPage'
import EventDetailsPage from '../pages/EventDetailsPage'
import TicketSelectionPage from '../pages/TicketSelectionPage'
import LoginPage from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'
import VerifyEmailPage from '../pages/VerifyEmailPage'
import ForgotPasswordPage from '../pages/ForgotPasswordPage'
import ResetPasswordPage from '../pages/ResetPasswordPage'
import MyTicketsPage from '../pages/MyTicketsPage'
import RequireAuth from '../features/auth/requireAuth'
import { verifyEmail } from '../features/auth/auth'
import { ApiError } from '../shared/api/client'

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
                loader: async ({ request }) => {
                    const token = new URL(request.url).searchParams.get('token')
                    if (!token) return 'invalid'

                    try {
                        await verifyEmail(token)
                        return 'verified'
                    } catch (error) {
                        if (error instanceof ApiError) {
                            if (error.status === 400) return 'invalid'
                            if (error.status === 409) return 'verified'
                        }

                        return 'unavailable'
                    }
                },
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
                path: 'organizer/events/new',
                element: <ComingSoonPage titleKey="createEvent" />,
            },
            {
                path: 'organizer/events',
                element: <ComingSoonPage titleKey="myEvents" />,
            },
            {
                path: 'organizer/help',
                element: <ComingSoonPage titleKey="help" />,
            },
            {
                path: '*',
                element: <NotFoundPage />,
            },
		],
    },
])