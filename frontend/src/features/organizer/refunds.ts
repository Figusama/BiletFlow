import type { EventRefundRequest } from './api'

export const ORGANIZER_DECISION_HOURS = 48

export type RefundTab = 'WAITING' | 'WITH_PLATFORM' | 'DECIDED' | 'STARTED_BY_ME'

export const refundTabs: RefundTab[] = ['WAITING', 'WITH_PLATFORM', 'DECIDED', 'STARTED_BY_ME']

export const matchesTab = (request: EventRefundRequest, tab: RefundTab) => {
    switch (tab) {
        case 'WAITING':
            return request.status === 'PENDING'
        case 'WITH_PLATFORM':
            return request.status === 'PENDING_ADMIN'
        case 'DECIDED':
            return request.source === 'CUSTOMER' && ['APPROVED', 'REJECTED', 'WITHDRAWN'].includes(request.status)
        case 'STARTED_BY_ME':
            return request.source === 'ORGANIZER_INITIATED'
    }
}

export const byOldestFirst = (first: EventRefundRequest, second: EventRefundRequest) =>
    new Date(first.created_at).getTime() - new Date(second.created_at).getTime()

export const decisionDeadline = (request: EventRefundRequest) =>
    new Date(new Date(request.created_at).getTime() + ORGANIZER_DECISION_HOURS * 3_600_000)

export const hoursLeft = (request: EventRefundRequest) =>
    Math.max(0, Math.ceil((decisionDeadline(request).getTime() - Date.now()) / 3_600_000))

export const URGENT_HOURS = 12

const RECENT_REFUND_DAYS = 7

export const isInProgress = (request: EventRefundRequest) => {
    if (request.status !== 'APPROVED') return false
    if (request.execution_status !== 'SUCCEEDED') return true
    const finishedAt = request.execution_finalized_at ? new Date(request.execution_finalized_at).getTime() : 0
    return Date.now() - finishedAt < RECENT_REFUND_DAYS * 86_400_000
}
