import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api/client'

export type RefundReason = 'CANNOT_ATTEND' | 'CHANGED_PLANS' | 'DUPLICATE_PURCHASE' | 'EVENT_DISSATISFACTION' | 'OTHER'

export const refundReasons: RefundReason[] = ['CANNOT_ATTEND', 'CHANGED_PLANS', 'DUPLICATE_PURCHASE', 'EVENT_DISSATISFACTION', 'OTHER']

export interface RefundEligibility {
    eligible: boolean
    fast_refund: boolean
    reason: string | null
    deadline: string | null
}

export interface BuyerRefundRequest {
    id: string
    request_number: string
    source: string
    status: 'PENDING' | 'PENDING_ADMIN' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
    execution_status: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED_FINAL' | null
    amount_minor: number
    created_at: string
    escalates_at: string | null
}

export const orderRefundKey = (orderId: string) => ['orders', orderId, 'refund']

export const useRefundEligibility = (orderId: string, enabled: boolean) =>
    useQuery({
        queryKey: [...orderRefundKey(orderId), 'eligibility'],
        queryFn: () => api<RefundEligibility>(`/orders/${orderId}/refund-eligibility`),
        enabled,
        retry: false,
    })

export const useOrderRefundRequests = (orderId: string, enabled: boolean) =>
    useQuery({
        queryKey: [...orderRefundKey(orderId), 'requests'],
        queryFn: () => api<BuyerRefundRequest[]>(`/orders/${orderId}/refund-requests`),
        enabled,
        retry: false,
    })

export const requestRefund = (orderId: string, reason: RefundReason, comment: string) =>
    api<BuyerRefundRequest>(`/orders/${orderId}/refund-requests`, { method: 'POST', json: { reason_code: reason, comment: comment || null } })

export const requestSpecialRefund = (orderId: string) => api<BuyerRefundRequest>(`/orders/${orderId}/special-refund`, { method: 'POST' })

export const withdrawRefund = (requestId: string) => api<BuyerRefundRequest>(`/refund-requests/${requestId}/withdraw`, { method: 'POST' })
