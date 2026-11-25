import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type { Order } from '../orders/api'
import type { SupportCase, SupportCaseDetail, SupportCategory } from '../organizer/support'

const REOPEN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export type SupportScope = 'EVENT_SUPPORT' | 'PLATFORM_SUPPORT'

export const mySupportCasesKey = ['support-cases', 'mine']

export const useMySupportCases = () =>
    useQuery({
        queryKey: mySupportCasesKey,
        queryFn: () => api<SupportCase[]>('/support/cases/mine'),
    })

export interface NewSupportCase {
    case_scope: SupportScope
    event_id: string | null
    order_id: string | null
    ticket_id: string | null
    previous_case_id: string | null
    category: SupportCategory
    custom_subject: string | null
    message: string
    client_message_id: string
}

export const createSupportCase = (input: NewSupportCase) => api<SupportCaseDetail>('/support/cases', { method: 'POST', json: input })

export const reopenSupportCase = (caseId: string) => api<SupportCaseDetail>(`/support/cases/${caseId}/reopen`, { method: 'POST' })

export const reopenDeadline = (resolvedAt: string) => new Date(new Date(resolvedAt).getTime() + REOPEN_WINDOW_MS)

export const useOrderBrief = (orderId: string | null) =>
    useQuery({
        queryKey: ['orders', orderId],
        queryFn: () => api<Order>(`/orders/${orderId}`),
        enabled: Boolean(orderId),
        retry: false,
    })
