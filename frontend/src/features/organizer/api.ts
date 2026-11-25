import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../../shared/api/client'
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

export const getPublishProblems = (error: unknown): string[] => {
    if (!(error instanceof ApiError) || error.status !== 422) return []
    const detail = (error.body as { detail?: { problems?: unknown } } | null)?.detail
    return Array.isArray(detail?.problems) ? detail.problems.filter((problem): problem is string => typeof problem === 'string') : []
}
