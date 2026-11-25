import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, apiPage } from '../../shared/api/client'
import type { Application, ApplicationStatus, Venue } from '../applications/api'
import type { ChangeRequest, EventRefundRequest, HistoryEntry, HistoryPage } from '../organizer/api'
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

export type ChangeFilter = ChangeReviewStatus | 'ALL'

export const changeFilters: ChangeFilter[] = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'ALL']

export interface AdminChangeRequest extends ChangeRequest {
    event_id: string
    event_title: string
    event_public_id: string
    organizer_name: string | null
}

export const adminChangesKey = ['admin', 'change-requests']

export const useAdminChangeRequests = (status: ChangeFilter, search = '') =>
    useQuery({
        queryKey: [...adminChangesKey, 'list', status, search],
        queryFn: () => api<AdminChangeRequest[]>(`/admin/change-requests?status=${status}${search ? `&q=${encodeURIComponent(search)}` : ''}`),
    })

export const useAdminChangeRequest = (requestId: string | undefined) =>
    useQuery({
        queryKey: [...adminChangesKey, 'detail', requestId],
        queryFn: () => api<AdminChangeRequest>(`/admin/change-requests/${requestId}`),
        enabled: Boolean(requestId),
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
    event_id: string
    event_title: string
    event_public_id: string
    organizer_name: string | null
    buyer_name: string | null
    buyer_email: string
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

export interface PaymentTimelineEntry {
    at: string
    type: string
    title: string
    details: Record<string, unknown>
}

export interface PaymentWebhook {
    id: string
    received_at: string
    processed_at: string | null
    verification_status: 'PENDING' | 'VALID' | 'INVALID'
    processing_status: 'PENDING' | 'PROCESSED' | 'IGNORED' | 'REJECTED'
}

export interface PaymentRefundAttempt {
    id: string
    refund_request_id: string
    status: RefundAttemptStatus
    amount_minor: number
    created_at: string
    finalized_at: string | null
}

export interface AdminPaymentDetail extends AdminPayment {
    order_status: string
    currency: string
    provider_invoice_id: string | null
    provider_payment_id: string | null
    processing_fee_minor: number | null
    check_failure_count: number
    updated_at: string
    refunds: PaymentRefundAttempt[]
    timeline: PaymentTimelineEntry[]
    webhooks: PaymentWebhook[]
}

export interface PaymentCheck {
    bank_status: string | null
    changed: boolean
    payment: AdminPaymentDetail
}

export const adminPaymentsKey = ['admin', 'payments']

export const useAdminPayments = (filter: PaymentFilter, search: string, page: number, pageSize: number) =>
    useQuery({
        queryKey: [...adminPaymentsKey, 'list', filter, search, page],
        queryFn: () => {
            const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) })
            if (filter === 'PROBLEMS') params.set('problems_only', 'true')
            else if (filter !== 'ALL') params.set('status', filter)
            if (search) params.set('q', search)
            return apiPage<AdminPayment>(`/admin/payments?${params}`)
        },
        placeholderData: keepPreviousData,
    })

export const useAdminPayment = (paymentId: string | undefined) =>
    useQuery({
        queryKey: [...adminPaymentsKey, 'detail', paymentId],
        queryFn: () => api<AdminPaymentDetail>(`/admin/payments/${paymentId}`),
        enabled: Boolean(paymentId),
    })

export const checkPaymentStatus = (paymentId: string) => api<PaymentCheck>(`/admin/payments/${paymentId}/check-status`, { method: 'POST' })

export interface AdminCounters {
    event_applications: number
    change_requests: number
    paid_sales_requests: number
    refund_requests: number
    cancellation_requests: number
    support_cases: number
    support_unassigned: number
    payments_overdue: number
}

export const adminCountersKey = ['admin', 'counters']

export const useAdminCounters = () =>
    useQuery({
        queryKey: adminCountersKey,
        queryFn: () => api<AdminCounters>('/admin/counters'),
        refetchInterval: 60_000,
    })

export const reconcilePayments = () => api<{ handled: number }>('/admin/payments/reconcile', { method: 'POST' })

export type ActivationReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export const activationReviewStatuses: ActivationReviewStatus[] = ['PENDING', 'APPROVED', 'REJECTED']

export interface VerificationChecks {
    identifier_format: boolean
    identifier_checksum: boolean
    iban_format: boolean
    iban_checksum: boolean
}

export interface ActivationRequest {
    id: string
    event_id: string
    event_title: string
    event_public_id: string
    organizer_name: string | null
    status: ActivationReviewStatus
    checks: VerificationChecks | null
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
        queryKey: [...activationsKey, 'requests', status],
        queryFn: () => api<ActivationRequest[]>(`/admin/paid-sales/requests?status=${status}`),
    })

export type ActivationStatus = 'PENDING_VERIFICATION' | 'FEE_PENDING' | 'ACTIVE' | 'SUSPENDED'

export type ActivationFilter = 'ALL' | ActivationStatus

export const activationFilters: ActivationFilter[] = ['ALL', 'PENDING_VERIFICATION', 'FEE_PENDING', 'ACTIVE', 'SUSPENDED']

export interface AdminActivation {
    id: string | null
    event_id: string
    event_title: string
    event_public_id: string
    event_status: string
    organizer_id: string | null
    organizer_name: string | null
    organizer_email: string | null
    status: ActivationStatus | 'NOT_REQUESTED'
    pending_request_id: string | null
    fee_amount_minor: number
    fee_currency: string
    fee_paid_at: string | null
    activated_at: string | null
    suspended_at: string | null
    suspension_reason: string | null
    suspended_by_name: string | null
    created_at: string | null
}

export interface ActivationFeePayment {
    id: string
    amount_minor: number
    currency: string
    status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'
    payment_mode: 'SANDBOX' | 'SIMULATION'
    created_at: string
    finalized_at: string | null
}

export interface AdminActivationDetail extends AdminActivation {
    paid_terms_version: string | null
    requests: ActivationRequest[]
    fee_payments: ActivationFeePayment[]
}

export const useAdminActivations = (status: ActivationFilter, search: string, page: number, pageSize: number) =>
    useQuery({
        queryKey: [...activationsKey, 'list', status, search, page],
        queryFn: () => {
            const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) })
            if (status !== 'ALL') params.set('status', status)
            if (search) params.set('q', search)
            return apiPage<AdminActivation>(`/admin/paid-sales/activations?${params}`)
        },
        placeholderData: keepPreviousData,
    })

export const useAdminActivationDetail = (eventId: string | undefined) =>
    useQuery({
        queryKey: [...activationsKey, 'detail', eventId],
        queryFn: () => api<AdminActivationDetail>(`/admin/events/${eventId}/paid-sales`),
        enabled: Boolean(eventId),
    })

export const suspendPaidSales = (eventId: string, reason: string) =>
    api<unknown>(`/admin/events/${eventId}/paid-sales/suspend`, { method: 'POST', json: { reason } })

export const resumePaidSales = (eventId: string) => api<unknown>(`/admin/events/${eventId}/paid-sales/resume`, { method: 'POST' })

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

export type RefundFailureReason = 'BANK_REFUSED' | 'BANK_NOT_CONFIRMED' | 'NOT_SENT'

export interface AdminRefundAttempt {
    id: string
    amount_minor: number
    status: RefundAttemptStatus
    attempt_actor: 'SYSTEM' | 'ORGANIZER' | 'PLATFORM_ADMIN'
    created_at: string
    finalized_at: string | null
    provider_ref: string | null
    failure_reason: RefundFailureReason | null
    next_check_at: string | null
    next_retry_at: string | null
}

export interface AdminRefundRequest extends EventRefundRequest {
    event_id: string
    request_number: string
    event_title: string
    event_public_id: string
    organizer_name: string | null
    buyer_name: string | null
    buyer_email: string
    refund_policy: Record<string, unknown>
    refund_deadline: string | null
    tickets_total: number
    tickets_checked_in: number
    reminder_at: string | null
    escalation_at: string | null
    escalated_at: string | null
    attempts: AdminRefundAttempt[]
}

export const MANDATORY_REFUND_SOURCES = ['EVENT_CANCELLATION', 'EVENT_CHANGED', 'SYSTEM_FAST_REFUND', 'EVENT_SUSPENSION']

export const MAX_SYSTEM_ATTEMPTS = 5

export type RefundTab = 'DECISION' | 'ATTENTION' | 'IN_PROGRESS' | 'FINISHED' | 'REJECTED' | 'ALL'

export const refundTabs: RefundTab[] = ['DECISION', 'ATTENTION', 'IN_PROGRESS', 'FINISHED', 'REJECTED', 'ALL']

const refundTabStatus: Record<RefundTab, 'PENDING_ADMIN' | 'APPROVED' | 'REJECTED' | 'ALL'> = {
    DECISION: 'PENDING_ADMIN',
    ATTENTION: 'APPROVED',
    IN_PROGRESS: 'APPROVED',
    FINISHED: 'APPROVED',
    REJECTED: 'REJECTED',
    ALL: 'ALL',
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

export const useAdminRefunds = (tab: RefundTab, search = '') =>
    useQuery({
        queryKey: [...adminRefundsKey, 'list', refundTabStatus[tab], search],
        queryFn: () =>
            api<AdminRefundRequest[]>(`/admin/refund-requests?status=${refundTabStatus[tab]}&limit=200${search ? `&q=${encodeURIComponent(search)}` : ''}`),
        select: (requests) => requests.filter((request) => matchesRefundTab(request, tab)),
    })

export const useAdminRefundDetail = (requestId: string | undefined) =>
    useQuery({
        queryKey: [...adminRefundsKey, 'detail', requestId],
        queryFn: () => api<AdminRefundRequest>(`/admin/refund-requests/${requestId}`),
        enabled: Boolean(requestId),
    })

export const checkRefundStatus = (requestId: string) => api<AdminRefundRequest>(`/admin/refund-requests/${requestId}/check-status`, { method: 'POST' })

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

export type CancellationFilter = CancellationReviewStatus | 'ALL'

export const cancellationFilters: CancellationFilter[] = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'ALL']

export type RefundHandlingMode = 'AUTOMATIC_FULL' | 'ADMIN_REVIEW'

export interface AdminCancellation {
    id: string
    event_id: string
    event_title: string
    event_public_id: string
    organizer_name: string | null
    status: CancellationReviewStatus
    reason: string
    refund_handling_mode: RefundHandlingMode | null
    review_comment: string | null
    reviewed_at: string | null
    created_at: string
}

export interface CancellationImpact {
    tickets_issued: number
    tickets_valid: number
    tickets_checked_in: number
    free_tickets: number
    paid_orders: number
    paid_amount_minor: number
    free_orders: number
    refunded_orders: number
    payments_in_progress: number
    pending_change_request_id: string | null
    pending_change_request_number: string | null
    default_refund_handling_mode: RefundHandlingMode
}

export interface AdminCancellationDetail extends AdminCancellation {
    impact: CancellationImpact
}

export const adminCancellationsKey = ['admin', 'cancellations']

export const useAdminCancellations = (status: CancellationFilter, search = '') =>
    useQuery({
        queryKey: [...adminCancellationsKey, 'list', status, search],
        queryFn: () => api<AdminCancellation[]>(`/admin/cancellation-requests?status=${status}${search ? `&q=${encodeURIComponent(search)}` : ''}`),
    })

export const useAdminCancellationDetail = (requestId: string | undefined) =>
    useQuery({
        queryKey: [...adminCancellationsKey, 'detail', requestId],
        queryFn: () => api<AdminCancellationDetail>(`/admin/cancellation-requests/${requestId}`),
        enabled: Boolean(requestId),
    })

export const approveCancellation = (requestId: string, mode: RefundHandlingMode) =>
    api<AdminCancellation>(`/admin/cancellation-requests/${requestId}/approve`, { method: 'POST', json: { refund_handling_mode: mode } })

export const rejectCancellation = (requestId: string, reviewComment: string) =>
    api<AdminCancellation>(`/admin/cancellation-requests/${requestId}/reject`, { method: 'POST', json: { review_comment: reviewComment } })

export type EventSuspendedFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED'

export const eventSuspendedFilters: EventSuspendedFilter[] = ['ALL', 'ACTIVE', 'SUSPENDED']

export const eventStatusFilters: ('ALL' | AdminEventStatus)[] = ['ALL', 'DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED']

export interface AdminEventDetails extends AdminEvent {
    suspended_at: string | null
    suspension_reason: string | null
}

export const adminEventsKey = ['admin', 'events']

export const useAdminEventList = (status: 'ALL' | AdminEventStatus, suspended: EventSuspendedFilter, search: string, page: number, pageSize: number) =>
    useQuery({
        queryKey: [...adminEventsKey, 'list', status, suspended, search, page],
        queryFn: () => {
            const params = new URLSearchParams({ limit: String(pageSize + 1), offset: String(page * pageSize) })
            if (status !== 'ALL') params.set('status', status)
            if (suspended !== 'ALL') params.set('suspended', String(suspended === 'SUSPENDED'))
            if (search) params.set('q', search)
            return api<AdminEventDetails[]>(`/admin/events?${params}`)
        },
        placeholderData: keepPreviousData,
    })

export const useAdminEventDetails = (publicId: string | undefined) =>
    useQuery({
        queryKey: [...adminEventsKey, 'detail', publicId],
        queryFn: async () => {
            const rows = await api<AdminEventDetails[]>(`/admin/events?q=${encodeURIComponent(publicId ?? '')}&limit=5`)
            return rows.find((event) => event.public_id === publicId) ?? null
        },
        enabled: Boolean(publicId),
    })

export const suspendEvent = (eventId: string, reason: string) =>
    api<AdminEventDetails>(`/admin/events/${eventId}/suspend`, { method: 'POST', json: { reason } })

export const restoreEvent = (eventId: string) => api<AdminEventDetails>(`/admin/events/${eventId}/restore`, { method: 'POST' })

export interface AuditEntry extends HistoryEntry {
    entity_id: string | null
}

export interface AuditPage extends Omit<HistoryPage, 'items'> {
    items: AuditEntry[]
}

export interface AuditFilters {
    from: string | null
    category: string
    result: '' | 'SUCCESS' | 'DENIED'
    eventId: string
    limit: number
    offset: number
}

export const useAdminAudit = (filters: AuditFilters) => {
    const params = new URLSearchParams({ limit: String(filters.limit), offset: String(filters.offset) })
    if (filters.from) params.set('from', filters.from)
    if (filters.category) params.append('category', filters.category)
    if (filters.result) params.set('result', filters.result)
    if (filters.eventId) params.set('event_id', filters.eventId)
    return useQuery({
        queryKey: ['admin', 'audit', filters],
        queryFn: () => api<AuditPage>(`/admin/audit?${params}`),
        placeholderData: keepPreviousData,
    })
}

export interface VenueInput {
    name: string
    address: string
    city: string
    timezone: string
    max_capacity: number
}

export const createVenue = (input: VenueInput) => api<Venue>('/admin/venues', { method: 'POST', json: input })
