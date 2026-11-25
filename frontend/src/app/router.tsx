import { createBrowserRouter, redirect } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import EventsPage from '../pages/EventsPage'
import NotFoundPage from '../pages/NotFoundPage'
import ErrorPage from '../pages/ErrorPage'
import ComingSoonPage from '../pages/ComingSoonPage'
import EventDetailsPage from '../pages/EventDetailsPage'
import TicketSelectionPage from '../pages/TicketSelectionPage'
import LoginPage from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'
import VerifyEmailPage from '../pages/VerifyEmailPage'
import ForgotPasswordPage from '../pages/ForgotPasswordPage'
import ResetPasswordPage from '../pages/ResetPasswordPage'
import MyTicketsPage from '../pages/MyTicketsPage'
import CheckoutPage from '../pages/CheckoutPage'
import OrderPage from '../pages/OrderPage'
import ApplicationPage from '../pages/ApplicationPage'
import MyApplicationsPage from '../pages/MyApplicationsPage'
import OrganizerEventPage from '../pages/OrganizerEventPage'
import OrganizerTicketTypesPage from '../pages/OrganizerTicketTypesPage'
import OrganizerSeatingPage from '../pages/OrganizerSeatingPage'
import OrganizerPaidSalesPage from '../pages/OrganizerPaidSalesPage'
import FeeSimulatorPage from '../pages/FeeSimulatorPage'
import OrganizerChangeRequestsPage from '../pages/OrganizerChangeRequestsPage'
import OrganizerEventLayout from '../features/organizer/components/OrganizerEventLayout'
import RequireAuth from '../features/auth/requireAuth'
import { verifyEmail } from '../features/auth/auth'
import { ApiError } from '../shared/api/client'

export const router = createBrowserRouter([
    {
        path: '/',
        element: <AppLayout />,
        errorElement: <ErrorPage />,
        children: [
            {
                errorElement: <ErrorPage />,
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
                        path: 'events/:eventId/paid-sales',
                        loader: ({ params }) => redirect(`/organizer/events/${params.eventId}/paid-sales`),
                    },
                    {
                        path: 'events/:eventId/tickets',
                        element: <TicketSelectionPage />,
                    },
                    {
                        path: '/auth/token',
                        element: <LoginPage />,
                    },
                    {
                        path: '/auth/register',
                        element: <RegisterPage />
                    },
                    {
                        path: '/auth/verify-email',
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
                        path: '/auth/forgot-password',
                        element: <ForgotPasswordPage />,
                    },
                    {
                        path: '/auth/reset-password',
                        element: <ResetPasswordPage />,
                    },
                    {
                        element: <RequireAuth />,
                        children: [
                            {
                                path: 'tickets',
                                element: <MyTicketsPage />,
                            },
                            {
                                path: 'checkout/:reservationId',
                                element: <CheckoutPage />,
                            },
                            {
                                path: 'orders/:orderId',
                                element: <OrderPage />,
                            },
                            {
                                path: 'organizer/events',
                                element: <MyApplicationsPage />,
                            },
                            {
                                path: 'paid-sales/fee-payments/:paymentId/simulator',
                                element: <FeeSimulatorPage />,
                            },
                            {
                                path: 'organizer/events/new',
                                element: <ApplicationPage />,
                            },
                            {
                                path: 'organizer/applications/:applicationId',
                                element: <ApplicationPage />,
                            },
                            {
                                path: 'organizer/events/:eventId',
                                element: <OrganizerEventLayout />,
                                children: [
                                    {
                                        index: true,
                                        element: <OrganizerEventPage />,
                                    },
                                    {
                                        path: 'ticket-types',
                                        element: <OrganizerTicketTypesPage />,
                                    },
                                    {
                                        path: 'seating',
                                        element: <OrganizerSeatingPage />,
                                    },
                                    {
                                        path: 'paid-sales',
                                        element: <OrganizerPaidSalesPage />,
                                    },
                                    {
                                        path: 'change-requests',
                                        element: <OrganizerChangeRequestsPage />,
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        path: 'organizer/help',
                        element: <ComingSoonPage titleKey="organizerHelp" />,
                    },
                    {
                        path: 'help',
                        element: <ComingSoonPage titleKey="help" />,
                    },
                    {
                        path: '*',
                        element: <NotFoundPage />,
                    },
                ],
            },
        ],
    },
])
