import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, apiBlob, ApiError } from '../../shared/api/client'
import type { EventCategory, EventPhoto } from '../events/api'
import type { Seat, TicketType, TicketTypeColor } from '../tickets/api'

export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED'
export type EventVisibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE'
export type EventSeatingMode = 'GENERAL_ADMISSION' | 'ASSIGNED_SEATING'
export type PaidSalesStatus = 'NOT_REQUESTED' | 'PENDING_VERIFICATION' | 'FEE_PENDING' | 'ACTIVE' | 'SUSPENDED'

export interface RefundPolicy {
    self_service_refund_until_hours_before_start?: number | null
}

export interface ManagedEvent {
    id: string
    public_id: string
    slug: string
    title: string
    description: string
    venue_id: string
    venue_name: string | null
    venue_address: string | null
    venue_city: string | null
    starts_at: string
    ends_at: string
    timezone: string
    visibility: EventVisibility
    responsible_name?: string | null
    responsible_email?: string | null
    responsible_phone?: string | null
    tickets_issued?: boolean
    seating_mode: EventSeatingMode
    ga_capacity: number | null
    status: EventStatus
    is_suspended: boolean
    public_contact_name: string | null
    public_contact_email: string | null
    public_contact_phone: string | null
    public_instagram_url: string | null
    public_telegram_url: string | null
    public_website_url: string | null
    published_at: string | null
    cancelled_at: string | null
    refund_policy: RefundPolicy
    categories: EventCategory[]
    images: EventPhoto[]
    cover_image_url: string | null
}

export type TicketKind = 'FREE' | 'PAID'
export type SalesStatus = 'ACTIVE' | 'PAUSED'

export interface ManagedTicketType extends TicketType {
    is_active: boolean
    sales_status: SalesStatus
}

export interface TicketTypeInput {
    name: string
    description: string | null
    kind: TicketKind
    price_minor: number
    quantity_total: number | null
    sales_start_at: string
    sales_end_at: string
    max_per_order: number
    color: TicketTypeColor | null
    is_active?: boolean
}

export type PaidSalesRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type FeePaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'
export type PayoutOwnerType = 'INDIVIDUAL' | 'LEGAL_ENTITY'

export interface PaidSalesRequest {
    id: string
    status: PaidSalesRequestStatus
    verification_snapshot: {
        owner_type?: PayoutOwnerType
        owner_name?: string
        identifier_masked?: string
        iban_masked?: string
        bank_name?: string
    }
    submitted_at: string
    reviewed_at: string | null
    rejection_reason: string | null
}

export interface FeePayment {
    id: string
    amount_minor: number
    status: FeePaymentStatus
    created_at: string
    simulator_url: string | null
    payment_url: string | null
}

export interface PaidSales {
    event_id: string
    status: PaidSalesStatus
    fee_amount_minor: number
    paid_terms_version: string | null
    activated_at: string | null
    suspended_at: string | null
    requests: PaidSalesRequest[]
    fee_payments: FeePayment[]
}

export interface PaidSalesTerms {
    version: string
    fee_amount_minor: number
}

export interface PayoutInput {
    owner_type: PayoutOwnerType
    owner_name: string
    identifier: string
    responsible_person_name: string
    contact_email: string
    contact_phone: string
    iban: string
    bank_name: string
    account_holder_name: string
}

export interface EventUpdate {
    description?: string
    public_contact_name?: string | null
    public_contact_email?: string | null
    public_contact_phone?: string | null
    public_instagram_url?: string | null
    public_telegram_url?: string | null
    public_website_url?: string | null
    ga_capacity?: number | null
    refund_policy?: RefundPolicy
    visibility?: EventVisibility
}

export const managedEventKey = (eventId: string) => ['organizer-events', eventId]

export const useManagedEvent = (eventId: string | undefined) =>
    useQuery({
        queryKey: managedEventKey(eventId ?? ''),
        queryFn: () => api<ManagedEvent>(`/events/${eventId}/manage`),
        enabled: Boolean(eventId),
    })

export const managedTicketTypesKey = (eventId: string | undefined) => ['organizer-events', eventId, 'ticket-types']

export const useManagedTicketTypes = (eventId: string | undefined) =>
    useQuery({
        queryKey: managedTicketTypesKey(eventId),
        queryFn: () => api<ManagedTicketType[]>(`/events/${eventId}/ticket-types/manage`),
        enabled: Boolean(eventId),
    })

export const paidSalesKey = (eventId: string | undefined) => ['organizer-events', eventId, 'paid-sales']

export const usePaidSalesTerms = () =>
    useQuery({ queryKey: ['paid-sales-terms'], queryFn: () => api<PaidSalesTerms>('/paid-sales/terms/current'), staleTime: Infinity })

export const submitPaidSalesRequest = (eventId: string, payout: PayoutInput) =>
    api<PaidSales>(`/events/${eventId}/paid-sales/requests`, { method: 'POST', json: { payout, accept_paid_terms: true } })

export const startFeePayment = (eventId: string, idempotencyKey: string) =>
    api<FeePayment>(`/events/${eventId}/paid-sales/fee-payments`, { method: 'POST', json: { idempotency_key: idempotencyKey } })

export const simulateFeePayment = (paymentId: string, outcome: 'approve' | 'decline' | 'timeout') =>
    api<PaidSales>(`/paid-sales/fee-payments/${paymentId}/simulate`, { method: 'POST', json: { outcome } })

export const usePaidSales = (eventId: string | undefined) =>
    useQuery({
        queryKey: paidSalesKey(eventId),
        queryFn: () => api<PaidSales>(`/events/${eventId}/paid-sales`),
        enabled: Boolean(eventId),
    })

export const updateEvent = (eventId: string, input: EventUpdate) =>
    api<ManagedEvent>(`/events/${eventId}`, { method: 'PATCH', json: input })

export const publishEvent = (eventId: string) => api<ManagedEvent>(`/events/${eventId}/publish`, { method: 'POST' })

export const unpublishEvent = (eventId: string) => api<ManagedEvent>(`/events/${eventId}/unpublish`, { method: 'POST' })

export const duplicateEvent = (eventId: string) => api<{ id: string }>(`/events/${eventId}/duplicate`, { method: 'POST' })

export const createTicketType = (eventId: string, input: TicketTypeInput) =>
    api<ManagedTicketType>(`/events/${eventId}/ticket-types`, { method: 'POST', json: input })

export const updateTicketType = (eventId: string, typeId: string, input: Partial<TicketTypeInput> & { sales_status?: SalesStatus }) =>
    api<ManagedTicketType>(`/events/${eventId}/ticket-types/${typeId}`, { method: 'PATCH', json: input })

export const deleteTicketType = (eventId: string, typeId: string) =>
    api<void>(`/events/${eventId}/ticket-types/${typeId}`, { method: 'DELETE' })

export const managedSeatsKey = (eventId: string | undefined) => ['organizer-events', eventId, 'seats']

export const useManagedSeats = (eventId: string | undefined) =>
    useQuery({
        queryKey: managedSeatsKey(eventId),
        queryFn: () => api<Seat[]>(`/events/${eventId}/seats/manage`),
        enabled: Boolean(eventId),
    })

export const syncSeats = (eventId: string) => api<Seat[]>(`/events/${eventId}/seats/sync`, { method: 'POST' })

export interface SeatChange {
    event_seat_ids: string[]
    ticket_type_id?: string | null
    is_enabled?: boolean
}

export const changeSeats = (eventId: string, change: SeatChange) =>
    api<Seat[]>(`/events/${eventId}/seats`, { method: 'PATCH', json: change })

export type ChangeField =
    | 'TITLE'
    | 'STARTS_AT'
    | 'ENDS_AT'
    | 'VENUE'
    | 'VENUE_LAYOUT'
    | 'GA_CAPACITY'
    | 'RESPONSIBLE_NAME'
    | 'RESPONSIBLE_EMAIL'
    | 'RESPONSIBLE_PHONE'
    | 'REFUND_POLICY'
    | 'CREATE_TICKET_TYPE'
    | 'TICKET_TYPE_PRICE'
    | 'TICKET_TYPE_QUANTITY'
    | 'TICKET_TYPE_ACTIVE'
    | 'TICKET_TYPE_SALES_WINDOW'
    | 'DELETE_TICKET_TYPE'

export type ChangeRequestStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'

export interface ChangeItem {
    field: ChangeField
    target_id: string | null
    new_value: unknown
}

export interface ChangeRequest {
    id: string
    request_number: string
    status: ChangeRequestStatus
    comment: string | null
    submitted_at: string | null
    reviewed_at: string | null
    review_comment: string | null
    created_at: string
    items: (ChangeItem & { id: string; old_value: unknown })[]
}

export const changeRequestsKey = (eventId: string | undefined) => ['organizer-events', eventId, 'change-requests']

export const useChangeRequests = (eventId: string | undefined) =>
    useQuery({
        queryKey: changeRequestsKey(eventId),
        queryFn: () => api<ChangeRequest[]>(`/events/${eventId}/change-requests`),
        enabled: Boolean(eventId),
    })

export const createChangeRequest = (eventId: string, items: ChangeItem[], comment: string | null) =>
    api<ChangeRequest>(`/events/${eventId}/change-requests`, { method: 'POST', json: { items, comment } })

export const submitChangeRequest = (requestId: string) => api<ChangeRequest>(`/change-requests/${requestId}/submit`, { method: 'POST' })

export const withdrawChangeRequest = (requestId: string) => api<ChangeRequest>(`/change-requests/${requestId}/withdraw`, { method: 'POST' })

export const deleteChangeRequest = (requestId: string) => api<void>(`/change-requests/${requestId}`, { method: 'DELETE' })

export type CancellationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'

export interface CancellationRequest {
    id: string
    status: CancellationStatus
    reason: string
    review_comment: string | null
    reviewed_at: string | null
    created_at: string
}

export const cancellationsKey = (eventId: string | undefined) => ['organizer-events', eventId, 'cancellations']

export const useCancellationRequests = (eventId: string | undefined) =>
    useQuery({
        queryKey: cancellationsKey(eventId),
        queryFn: () => api<CancellationRequest[]>(`/events/${eventId}/cancellation-requests`),
        enabled: Boolean(eventId),
    })

export const cancelEvent = (eventId: string, reason: string) =>
    api<{ status: string }>(`/events/${eventId}/cancel`, { method: 'POST', json: { reason } })

export const requestCancellation = (eventId: string, reason: string) =>
    api<CancellationRequest>(`/events/${eventId}/cancellation-requests`, { method: 'POST', json: { reason } })

export const withdrawCancellation = (eventId: string, requestId: string) =>
    api<CancellationRequest>(`/events/${eventId}/cancellation-requests/${requestId}/withdraw`, { method: 'POST' })

export interface PublishProblem {
    code: string | null
    text: string
}

export const getPublishProblems = (error: unknown): PublishProblem[] => {
    if (!(error instanceof ApiError) || error.status !== 422) return []
    const detail = (error.body as { detail?: { problems?: unknown; problem_codes?: unknown } } | null)?.detail
    if (!Array.isArray(detail?.problems)) return []
    const codes = Array.isArray(detail.problem_codes) ? detail.problem_codes : []
    return detail.problems
        .map((text, index) => ({ code: typeof codes[index] === 'string' ? (codes[index] as string) : null, text }))
        .filter((problem): problem is PublishProblem => typeof problem.text === 'string')
}

export type StaffRole = 'EVENT_ADMIN' | 'EVENT_SUPPORT'
export type StaffInvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED' | 'EXPIRED'

export interface StaffMember {
    user_id: string
    public_id: string
    full_name: string | null
    roles: string[]
}

export interface StaffInvitation {
    id: string
    invited_user_public_id: string
    invited_user_name: string | null
    invited_role: StaffRole
    status: StaffInvitationStatus
    expires_at: string
    created_at: string
    declined_at: string | null
}

export interface StaffOverview {
    members: StaffMember[]
    invitations: StaffInvitation[]
}

export const staffKey = (eventId: string | undefined) => ['organizer-events', eventId, 'staff']

export const useStaff = (eventId: string | undefined) =>
    useQuery({
        queryKey: staffKey(eventId),
        queryFn: () => api<StaffOverview>(`/events/${eventId}/staff`),
        enabled: Boolean(eventId),
    })

export const inviteStaff = (eventId: string, userPublicId: string, role: StaffRole) =>
    api<StaffInvitation>(`/events/${eventId}/staff-invitations`, { method: 'POST', json: { user_public_id: userPublicId, role } })

export const revokeStaffInvitation = (eventId: string, invitationId: string) =>
    api<StaffInvitation>(`/events/${eventId}/staff-invitations/${invitationId}/revoke`, { method: 'POST' })

export const revokeStaffRole = (eventId: string, userId: string, role: StaffRole) =>
    api<void>(`/events/${eventId}/staff/${userId}/roles/${role}`, { method: 'DELETE' })

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT'
export type PromoScope = 'ORDER' | 'SELECTED_TICKET_TYPES'

export interface PromoCode {
    id: string
    code: string
    campaign_id: string | null
    discount_type: DiscountType
    percentage_bps: number | null
    fixed_amount_minor: number | null
    application_scope: PromoScope
    ticket_type_ids: string[]
    max_redemptions: number | null
    redemption_count: number
    valid_from: string
    valid_until: string
    is_active: boolean
    campaign_link: string | null
}

export interface PromoCodeInput {
    code: string | null
    campaign_id: string | null
    discount_type: DiscountType
    percentage_bps: number | null
    fixed_amount_minor: number | null
    application_scope: PromoScope
    ticket_type_ids: string[]
    max_redemptions: number | null
    valid_from: string
    valid_until: string
}

export interface Campaign {
    id: string
    name: string
}

export interface CampaignStats {
    redemptions: number
    tickets_sold: number
    gross_minor: number
    discount_minor: number
    net_minor: number
    refunded_minor: number
    net_after_refunds_minor: number
}

export const promoCodesKey = (eventId: string | undefined) => ['organizer-events', eventId, 'promo-codes']

export const usePromoCodes = (eventId: string | undefined) =>
    useQuery({
        queryKey: promoCodesKey(eventId),
        queryFn: () => api<PromoCode[]>(`/events/${eventId}/promo-codes`),
        enabled: Boolean(eventId),
    })

export const useCampaigns = (eventId: string | undefined) =>
    useQuery({
        queryKey: ['organizer-events', eventId, 'campaigns'],
        queryFn: () => api<Campaign[]>(`/events/${eventId}/campaigns`),
        enabled: Boolean(eventId),
    })

export const useCampaignStats = (eventId: string, campaignId: string | null) =>
    useQuery({
        queryKey: ['organizer-events', eventId, 'campaigns', campaignId, 'stats'],
        queryFn: () => api<CampaignStats>(`/events/${eventId}/campaigns/${campaignId}/stats`),
        enabled: Boolean(campaignId),
    })

export interface PromoCodeStats extends CampaignStats {
    promo_code_id: string
    code: string
    max_redemptions: number | null
}

export const usePromoCodeStats = (eventId: string, promoId: string) =>
    useQuery({
        queryKey: ['organizer-events', eventId, 'promo-codes', promoId, 'stats'],
        queryFn: () => api<PromoCodeStats>(`/events/${eventId}/promo-codes/${promoId}/stats`),
    })

export const usePromoQr = (eventId: string, promoId: string, enabled: boolean) =>
    useQuery({
        queryKey: ['organizer-events', eventId, 'promo-codes', promoId, 'qr'],
        queryFn: () => api<{ link: string; data_url: string }>(`/events/${eventId}/promo-codes/${promoId}/qr`),
        enabled,
        staleTime: Infinity,
    })

export const createCampaign = (eventId: string, name: string) =>
    api<Campaign>(`/events/${eventId}/campaigns`, { method: 'POST', json: { name } })

export const createPromoCode = (eventId: string, input: PromoCodeInput) =>
    api<PromoCode>(`/events/${eventId}/promo-codes`, { method: 'POST', json: input })

export const setPromoCodeActive = (eventId: string, promoId: string, isActive: boolean) =>
    api<PromoCode>(`/events/${eventId}/promo-codes/${promoId}`, { method: 'PATCH', json: { is_active: isActive } })

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED'

export interface EventOrder {
    id: string
    order_number: string
    status: OrderStatus
    buyer_name: string | null
    buyer_email: string
    tickets: number
    subtotal_minor: number
    discount_minor: number
    total_minor: number
    refund_status: string | null
    refund_execution_status: string | null
    created_at: string
    confirmed_at: string | null
}

export const ORDERS_PAGE_SIZE = 50

export const eventOrdersKey = (eventId: string | undefined) => ['organizer-events', eventId, 'orders']

export const useEventOrders = (eventId: string | undefined, search: string, status: OrderStatus | null, limit: number) =>
    useQuery({
        queryKey: [...eventOrdersKey(eventId), search, status, limit],
        queryFn: () => {
            const params = new URLSearchParams({ limit: String(limit) })
            if (search) params.set('q', search)
            if (status) params.set('status', status)
            return api<EventOrder[]>(`/events/${eventId}/orders?${params}`)
        },
        enabled: Boolean(eventId),
        placeholderData: (previous) => previous,
    })

export type RefundRequestSource =
    | 'CUSTOMER'
    | 'PLATFORM_ADMIN'
    | 'EVENT_CANCELLATION'
    | 'EVENT_CHANGED'
    | 'SYSTEM_FAST_REFUND'
    | 'ORGANIZER_INITIATED'
    | 'EVENT_SUSPENSION'

export type RefundRequestStatus = 'PENDING' | 'PENDING_ADMIN' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
export type RefundExecutionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED_FINAL'

export interface EventRefundRequest {
    id: string
    order_id: string
    order_number: string
    source: RefundRequestSource
    status: RefundRequestStatus
    execution_status: RefundExecutionStatus | null
    reason_code: string | null
    comment: string | null
    amount_minor: number
    created_at: string
    reviewed_at: string | null
    execution_finalized_at: string | null
    escalates_at: string | null
}

export const eventRefundsKey = (eventId: string | undefined) => ['organizer-events', eventId, 'refund-requests']

export const usePendingRefunds = (eventId: string | undefined) =>
    useQuery({
        queryKey: [...eventRefundsKey(eventId), 'PENDING'],
        queryFn: () => api<EventRefundRequest[]>(`/events/${eventId}/refund-requests?status=PENDING`),
        enabled: Boolean(eventId),
    })

export const useEventRefundRequests = (eventId: string | undefined) =>
    useQuery({
        queryKey: [...eventRefundsKey(eventId), 'ALL'],
        queryFn: () => api<EventRefundRequest[]>(`/events/${eventId}/refund-requests`),
        enabled: Boolean(eventId),
    })

export const approveRefundRequest = (requestId: string) =>
    api<EventRefundRequest>(`/refund-requests/${requestId}/approve`, { method: 'POST', json: {} })

export const rejectRefundRequest = (requestId: string, comment: string) =>
    api<EventRefundRequest>(`/refund-requests/${requestId}/reject`, { method: 'POST', json: { comment } })

export const refundWholeOrder = (orderId: string, comment: string | null) =>
    api<EventRefundRequest>(`/orders/${orderId}/organizer-refund`, { method: 'POST', json: { comment } })

export type AnalyticsBucket = 'hour' | 'day' | 'week'

export interface AnalyticsInventory {
    capacity: number | null
    sold: number
    historical_confirmed_tickets: number
    inventory_occupied: number
    remaining_inventory: number | null
    percent_sold: number | null
}

export interface AnalyticsFinancial {
    gross_sales_minor: number
    discounts_minor: number
    collected_minor: number | null
    refunded_minor: number | null
    net_revenue_minor: number | null
    estimated_processing_fees_minor: number | null
    estimated_proceeds_minor: number | null
    is_demonstration: boolean
}

export interface AnalyticsSalesPoint {
    bucket_start: string
    orders: number
    tickets: number
    gross_sales_minor: number
}

export interface AnalyticsTicketType {
    ticket_type_id: string
    name: string
    sold: number
    available: number
    reserved: number
    refunded: number
    cancelled: number
    checked_in: number
    confirmed_tickets: number
    gross_sales_minor: number
    discounts_minor: number
    net_sales_minor: number
}

export interface AnalyticsPromotion {
    promo_code_id: string
    code: string
    campaign_name: string | null
    redemptions: number
    tickets: number
    gross_sales_minor: number
    discounts_minor: number
    refunded_minor: number | null
}

export interface AnalyticsAttendance {
    eligible: number
    checked_in: number
    absent: number
    check_in_percentage: number | null
}

export interface EventAnalytics {
    event_id: string
    timezone: string
    inventory: AnalyticsInventory
    financial: AnalyticsFinancial
    sales_over_time: AnalyticsSalesPoint[]
    by_ticket_type: AnalyticsTicketType[]
    promotions: AnalyticsPromotion[]
    attendance: AnalyticsAttendance
}

export const useEventAnalytics = (eventId: string | undefined, days: number | null, ticketTypeId: string | null) =>
    useQuery({
        queryKey: ['organizer-events', eventId, 'analytics', days, ticketTypeId],
        queryFn: () => {
            const params = new URLSearchParams()
            if (days) params.set('from', new Date(Date.now() - days * 86_400_000).toISOString())
            if (ticketTypeId) params.set('ticket_type_id', ticketTypeId)
            const query = params.toString()
            return api<EventAnalytics>(`/events/${eventId}/analytics${query ? `?${query}` : ''}`)
        },
        enabled: Boolean(eventId),
    })

export type TicketStatus = 'VALID' | 'CHECKED_IN' | 'CANCELLED' | 'REFUNDED'
export type PaymentStatus = 'PENDING' | 'AUTHORIZED' | 'CAPTURING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

export interface EventAttendee {
    ticket_id: string | null
    ticket_public_id: string | null
    attendee_name: string | null
    ticket_type_id: string | null
    ticket_type_name: string | null
    seat_label: string | null
    ticket_status: TicketStatus | null
    checked_in_at: string | null
    quantity: number
    order_id: string
    order_number: string
    order_status: OrderStatus
    payment_status: PaymentStatus | null
    buyer_name: string | null
    buyer_email: string
    paid_minor: number
    promo_code: string | null
}

export interface AttendeePage {
    items: EventAttendee[]
    total: number
    counts: { all: number; checked_in: number; pending_orders: number }
}

export interface AttendeeFilters {
    search: string
    checkedIn: boolean | null
    ticketTypeId: string | null
    hasPromo: boolean
}

export const eventAttendeesKey = (eventId: string | undefined) => ['organizer-events', eventId, 'attendees']

const attendeeParams = (filters: AttendeeFilters) => {
    const params = new URLSearchParams()
    if (filters.search) params.set('q', filters.search)
    if (filters.checkedIn !== null) params.set('checked_in', String(filters.checkedIn))
    if (filters.ticketTypeId) params.set('ticket_type_id', filters.ticketTypeId)
    if (filters.hasPromo) params.set('has_promo', 'true')
    return params
}

export const useEventAttendees = (eventId: string | undefined, filters: AttendeeFilters, limit: number) =>
    useQuery({
        queryKey: [...eventAttendeesKey(eventId), filters, limit],
        queryFn: () => {
            const params = attendeeParams(filters)
            params.set('limit', String(limit))
            return api<AttendeePage>(`/events/${eventId}/attendees?${params}`)
        },
        enabled: Boolean(eventId),
        placeholderData: keepPreviousData,
    })

export const downloadAttendeesCsv = async (eventId: string, filters: AttendeeFilters) => {
    const blob = await apiBlob(`/events/${eventId}/attendees/export.csv?${attendeeParams(filters)}`)
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'attendees.csv'
    link.click()
    URL.revokeObjectURL(link.href)
}

export interface OrderDetailTicket {
    ticket_id: string
    ticket_public_id: string
    attendee_name: string
    ticket_type_name: string
    seat_label: string | null
    status: TicketStatus
    checked_in_at: string | null
}

export interface OrderDetailItem {
    id: string
    ticket_type_name: string
    seat_label: string | null
    unit_price_minor: number
    quantity: number
}

export interface EventOrderDetail {
    id: string
    order_number: string
    status: OrderStatus
    created_at: string
    confirmed_at: string | null
    buyer_name: string | null
    buyer_email: string
    items: OrderDetailItem[]
    tickets: OrderDetailTicket[]
    subtotal_minor: number
    discount_minor: number
    total_minor: number
    promo_code: string | null
    payment: { status: PaymentStatus; attempt_number: number } | null
    refund_deadline: string | null
    refund: { id: string; source: RefundRequestSource; status: RefundRequestStatus; execution_status: RefundExecutionStatus | null } | null
}

export const eventOrderDetailKey = (eventId: string | undefined, orderId: string | undefined) => [...eventOrdersKey(eventId), 'detail', orderId]

export const useEventOrderDetail = (eventId: string | undefined, orderId: string | undefined) =>
    useQuery({
        queryKey: eventOrderDetailKey(eventId, orderId),
        queryFn: () => api<EventOrderDetail>(`/events/${eventId}/orders/${orderId}`),
        enabled: Boolean(eventId && orderId),
    })

export interface PrivateInvitation {
    id: string
    invited_email: string
    created_at: string
    expires_at: string
    is_active: boolean
    tickets_count: number
}

export const privateInvitationsKey = (eventId: string | undefined) => ['organizer-events', eventId, 'private-invitations']

export const usePrivateInvitations = (eventId: string | undefined) =>
    useQuery({
        queryKey: privateInvitationsKey(eventId),
        queryFn: () => api<PrivateInvitation[]>(`/events/${eventId}/private-invitations`),
        enabled: Boolean(eventId),
    })

export const sendPrivateInvitations = (eventId: string, emails: string[]) =>
    api<PrivateInvitation[]>(`/events/${eventId}/private-invitations`, { method: 'POST', json: { emails } })

export interface HistoryEntry {
    id: string
    created_at: string
    action_type: string
    category: string
    description: string
    result: string
    actor: { kind: string; user_id: string | null; display_name: string }
    entity_type: string
    entity_label: string | null
    event_id: string | null
    event_title: string | null
    details: Record<string, unknown>
}

export interface HistoryPage {
    total: number
    limit: number
    offset: number
    items: HistoryEntry[]
}

export const eventHistoryKey = (eventId: string | undefined) => ['organizer-events', eventId, 'history']

export const useEventHistory = (eventId: string | undefined, filters: { from: string | null; category: string; limit: number; offset: number }) => {
    const params = new URLSearchParams({ limit: String(filters.limit), offset: String(filters.offset) })
    if (filters.from) params.set('from', filters.from)
    if (filters.category) params.append('category', filters.category)
    return useQuery({
        queryKey: [...eventHistoryKey(eventId), filters],
        queryFn: () => api<HistoryPage>(`/events/${eventId}/history?${params.toString()}`),
        enabled: Boolean(eventId),
        placeholderData: keepPreviousData,
    })
}

export const useHistoryCategories = () =>
    useQuery({ queryKey: ['history-categories'], queryFn: () => api<string[]>('/history/categories'), staleTime: Infinity })
