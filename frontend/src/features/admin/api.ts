import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type { Application, ApplicationStatus } from '../applications/api'
import type { ChangeRequest, EventRefundRequest } from '../organizer/api'
import type { SupportCase, SupportCaseDetail } from '../organizer/support'

export type ReviewStatus = Exclude<ApplicationStatus, 'DRAFT'>

export const reviewStatuses: ReviewStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']

export interface AdminApplication extends Application {
    applicant_user_id: string
    venue_address_snapshot: string | null
    venue_city_snapshot: string | null
    submitted_at: string | null
    reviewed_at: string | null
    agreements: { document_type: 'ORGANIZER_RULES' | 'TICKET_SALES_FINANCIAL_TERMS'; document_version: string; accepted_at: string; is_current: boolean }[]
}

export const adminApplicationsKey = ['admin', 'applications']

export const useAdminApplications = (status: ReviewStatus, page: number, pageSize: number) =>
    useQuery({
        queryKey: [...adminApplicationsKey, 'list', status, page],
        queryFn: () => api<AdminApplication[]>(`/admin/event-applications?status=${status}&limit=${pageSize + 1}&offset=${page * pageSize}`),
        placeholderData: keepPreviousData,
    })

export const useAdminApplication = (applicationId: string | undefined) =>
    useQuery({
        queryKey: [...adminApplicationsKey, 'detail', applicationId],
        queryFn: () => api<AdminApplication>(`/event-applications/${applicationId}`),
        enabled: Boolean(applicationId),
    })

export const approveApplication = (applicationId: string) =>
    api<AdminApplication>(`/admin/event-applications/${applicationId}/approve`, {
        method: 'POST',
        json: { confirm_responsible_organizer: true },
    })

export const rejectApplication = (applicationId: string, reviewComment: string) =>
    api<AdminApplication>(`/admin/event-applications/${applicationId}/reject`, {
        method: 'POST',
        json: { review_comment: reviewComment },
    })

export const waitingTime = (submittedAt: string) => {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(submittedAt).getTime()) / 60_000))
    if (minutes >= 1440) return { value: Math.floor(minutes / 1440), unit: 'day' as const }
    if (minutes >= 60) return { value: Math.floor(minutes / 60), unit: 'hour' as const }
    return { value: minutes, unit: 'minute' as const }
}

export type AdminEventStatus = 'DRAFT' | 'PUBLISHED' | 'COMPLETED' | 'CANCELLED'

export interface AdminEvent {
    id: string
    public_id: string
    title: string
    status: AdminEventStatus
    is_suspended: boolean
    starts_at: string
    organizer_email: string | null
    tickets_issued: number
}

export const useAdminEvents = () =>
    useQuery({
        queryKey: ['admin', 'events'],
        queryFn: () => api<AdminEvent[]>('/admin/events?limit=200'),
        staleTime: 60_000,
    })

export type ChangeReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'

export const changeReviewStatuses: ChangeReviewStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']

export interface AdminChangeRequest extends ChangeRequest {
    event_id: string
}

export const adminChangesKey = ['admin', 'change-requests']

export const useAdminChangeRequests = (status: ChangeReviewStatus) =>
    useQuery({
        queryKey: [...adminChangesKey, status],
        queryFn: () => api<AdminChangeRequest[]>(`/admin/change-requests?status=${status}`),
    })

export const approveChangeRequest = (requestId: string, reviewComment: string | null) =>
    api<AdminChangeRequest>(`/admin/change-requests/${requestId}/approve`, { method: 'POST', json: { review_comment: reviewComment } })

export const rejectChangeRequest = (requestId: string, reviewComment: string) =>
    api<AdminChangeRequest>(`/admin/change-requests/${requestId}/reject`, { method: 'POST', json: { review_comment: reviewComment } })

export type PaymentStatus = 'PENDING' | 'AUTHORIZED' | 'CAPTURING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

export type PaymentFilter = PaymentStatus | 'ALL' | 'PROBLEMS'

export const paymentFilters: PaymentFilter[] = ['ALL', 'PROBLEMS', 'PENDING', 'AUTHORIZED', 'CAPTURING', 'SUCCEEDED', 'FAILED', 'CANCELLED']

export interface AdminPayment {
    id: string
    order_id: string
    order_number: string
    status: PaymentStatus
    pending_operation: 'CAPTURE' | 'CANCEL' | null
    cancellation_reason: 'USER_REQUESTED' | 'RESERVATION_EXPIRED' | 'CAPTURE_FAILED' | null
    amount_minor: number
    is_simulated: boolean
    is_overdue: boolean
    next_check_at: string | null
    created_at: string
    finalized_at: string | null
}

export const adminPaymentsKey = ['admin', 'payments']

export const useAdminPayments = (filter: PaymentFilter, search: string, page: number, pageSize: number) =>
    useQuery({
        queryKey: [...adminPaymentsKey, filter, search, page],
        queryFn: () => {
            const params = new URLSearchParams({ limit: String(pageSize + 1), offset: String(page * pageSize) })
            if (filter === 'PROBLEMS') params.set('problems_only', 'true')
            else if (filter !== 'ALL') params.set('status', filter)
            if (search) params.set('q', search)
            return api<AdminPayment[]>(`/admin/payments?${params}`)
        },
        placeholderData: keepPreviousData,
    })

export const reconcilePayments = () => api<{ handled: number }>('/admin/payments/reconcile', { method: 'POST' })

export type ActivationReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export const activationReviewStatuses: ActivationReviewStatus[] = ['PENDING', 'APPROVED', 'REJECTED']

export interface ActivationRequest {
    id: string
    event_id: string
    event_title: string
    status: ActivationReviewStatus
    verification_snapshot: {
        owner_type?: 'INDIVIDUAL' | 'LEGAL_ENTITY'
        owner_name?: string
        identifier_masked?: string
        iban_masked?: string
        bank_name?: string
        account_holder_name?: string
        responsible_person_name?: string
        contact_email?: string
        contact_phone?: string
    }
    terms_version: string
    submitted_at: string
    reviewed_at: string | null
    rejection_reason: string | null
}

export const activationsKey = ['admin', 'paid-sales']

export const useActivationRequests = (status: ActivationReviewStatus) =>
    useQuery({
        queryKey: [...activationsKey, status],
        queryFn: () => api<ActivationRequest[]>(`/admin/paid-sales/requests?status=${status}`),
    })

export const approveActivation = (requestId: string) => api<unknown>(`/admin/paid-sales/requests/${requestId}/approve`, { method: 'POST' })

export const rejectActivation = (requestId: string, reason: string) =>
    api<unknown>(`/admin/paid-sales/requests/${requestId}/reject`, { method: 'POST', json: { reason } })

export interface AdminUser {
    id: string
    public_id: string
    email: string
    full_name: string | null
    personal_role: 'USER' | 'PLATFORM_ADMIN'
    is_suspended: boolean
    created_at: string
}

export type UserStatusFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED'

export const userStatusFilters: UserStatusFilter[] = ['ALL', 'ACTIVE', 'SUSPENDED']

export const adminUsersKey = ['admin', 'users']

export const useAdminUsers = (status: UserStatusFilter, search: string, page: number, pageSize: number) =>
    useQuery({
        queryKey: [...adminUsersKey, 'list', status, search, page],
        queryFn: () => {
            const params = new URLSearchParams({ limit: String(pageSize + 1), offset: String(page * pageSize) })
            if (status !== 'ALL') params.set('suspended', String(status === 'SUSPENDED'))
            if (search) params.set('q', search)
            return api<AdminUser[]>(`/admin/users?${params}`)
        },
        placeholderData: keepPreviousData,
    })

export const useAdminUser = (publicId: string | undefined) =>
    useQuery({
        queryKey: [...adminUsersKey, 'detail', publicId],
        queryFn: async () => {
            const rows = await api<AdminUser[]>(`/admin/users?q=${encodeURIComponent(publicId ?? '')}&limit=5`)
            return rows.find((user) => user.public_id === publicId) ?? null
        },
        enabled: Boolean(publicId),
    })

export interface AdminOrder {
    id: string
    order_number: string
    event_title: string
    status: 'CONFIRMED' | 'PENDING' | 'CANCELLED' | 'EXPIRED'
    total_minor: number
    created_at: string
}

export const useAdminUserOrders = (email: string | undefined) =>
    useQuery({
        queryKey: ['admin', 'orders', 'by-buyer', email],
        queryFn: () => api<AdminOrder[]>(`/admin/orders?q=${encodeURIComponent(email ?? '')}&limit=5`),
        enabled: Boolean(email),
    })

export const setUserSuspended = (userId: string, suspended: boolean) =>
    api<void>(`/users/${userId}/${suspended ? 'suspend' : 'unsuspend'}`, { method: 'POST' })

export type RefundAttemptStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'

export interface AdminRefundAttempt {
    id: string
    amount_minor: number
    status: RefundAttemptStatus
    attempt_actor: 'SYSTEM' | 'ORGANIZER' | 'PLATFORM_ADMIN'
    created_at: string
    finalized_at: string | null
}

export interface AdminRefundRequest extends EventRefundRequest {
    event_id: string
    attempts: AdminRefundAttempt[]
}

export const MANDATORY_REFUND_SOURCES = ['EVENT_CANCELLATION', 'EVENT_CHANGED', 'SYSTEM_FAST_REFUND', 'EVENT_SUSPENSION']

export const MAX_SYSTEM_ATTEMPTS = 5

export type RefundTab = 'DECISION' | 'ATTENTION' | 'IN_PROGRESS' | 'FINISHED' | 'REJECTED'

export const refundTabs: RefundTab[] = ['DECISION', 'ATTENTION', 'IN_PROGRESS', 'FINISHED', 'REJECTED']

const refundTabStatus: Record<RefundTab, 'PENDING_ADMIN' | 'APPROVED' | 'REJECTED'> = {
    DECISION: 'PENDING_ADMIN',
    ATTENTION: 'APPROVED',
    IN_PROGRESS: 'APPROVED',
    FINISHED: 'APPROVED',
    REJECTED: 'REJECTED',
}

export const lastAttempt = (request: AdminRefundRequest) => request.attempts[request.attempts.length - 1]

export const needsAttention = (request: AdminRefundRequest) => {
    if (request.status !== 'APPROVED' || request.execution_status !== 'IN_PROGRESS') return false
    const status = lastAttempt(request)?.status
    return status === 'UNKNOWN' || status === 'FAILED'
}

const matchesRefundTab = (request: AdminRefundRequest, tab: RefundTab) => {
    const isOpen = request.execution_status === 'NOT_STARTED' || request.execution_status === 'IN_PROGRESS'
    if (tab === 'ATTENTION') return needsAttention(request)
    if (tab === 'IN_PROGRESS') return isOpen && !needsAttention(request)
    if (tab === 'FINISHED') return !isOpen
    return true
}

export const adminRefundsKey = ['admin', 'refunds']

export const useAdminRefunds = (tab: RefundTab) =>
    useQuery({
        queryKey: [...adminRefundsKey, refundTabStatus[tab]],
        queryFn: () => api<AdminRefundRequest[]>(`/admin/refund-requests?status=${refundTabStatus[tab]}&limit=200`),
        select: (requests) => requests.filter((request) => matchesRefundTab(request, tab)),
    })

export const approveAdminRefund = (requestId: string) => api<AdminRefundRequest>(`/refund-requests/${requestId}/approve`, { method: 'POST', json: {} })

export const rejectAdminRefund = (requestId: string, comment: string) =>
    api<AdminRefundRequest>(`/refund-requests/${requestId}/reject`, { method: 'POST', json: { comment } })

export const retryAdminRefund = (requestId: string) => api<AdminRefundRequest>(`/admin/refund-requests/${requestId}/retry`, { method: 'POST' })

export const adminSupportKey = ['admin', 'support-cases']

export const useAdminSupportCases = () =>
    useQuery({
        queryKey: adminSupportKey,
        queryFn: () => api<SupportCase[]>('/admin/support/cases'),
    })

export const returnCaseToEvent = (caseId: string) => api<SupportCaseDetail>(`/support/cases/${caseId}/return`, { method: 'POST' })

export const startFullRefund = (orderId: string, comment: string | null) =>
    api<AdminRefundRequest>(`/admin/orders/${orderId}/refund`, { method: 'POST', json: { comment } })

export const useAdminOrderPayments = (orderNumber: string | null) =>
    useQuery({
        queryKey: ['admin', 'payments', 'by-order', orderNumber],
        queryFn: () => api<AdminPayment[]>(`/admin/payments?q=${encodeURIComponent(orderNumber ?? '')}&limit=5`),
        enabled: Boolean(orderNumber),
    })

export type CancellationReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'

export const cancellationStatuses: CancellationReviewStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']

export type RefundHandlingMode = 'AUTOMATIC_FULL' | 'ADMIN_REVIEW'

export interface AdminCancellation {
    id: string
    event_id: string
    event_title: string
    status: CancellationReviewStatus
    reason: string
    refund_handling_mode: RefundHandlingMode | null
    review_comment: string | null
    reviewed_at: string | null
    created_at: string
}

export const adminCancellationsKey = ['admin', 'cancellations']

export const useAdminCancellations = (status: CancellationReviewStatus) =>
    useQuery({
        queryKey: [...adminCancellationsKey, status],
        queryFn: () => api<AdminCancellation[]>(`/admin/cancellation-requests?status=${status}`),
    })

export const approveCancellation = (requestId: string, mode: RefundHandlingMode) =>
    api<AdminCancellation>(`/admin/cancellation-requests/${requestId}/approve`, { method: 'POST', json: { refund_handling_mode: mode } })

export const rejectCancellation = (requestId: string, reviewComment: string) =>
    api<AdminCancellation>(`/admin/cancellation-requests/${requestId}/reject`, { method: 'POST', json: { review_comment: reviewComment } })
