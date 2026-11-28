import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import { useEventOrderDetail } from './api'

export type SupportCaseStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_CUSTOMER' | 'RESOLVED'

export type SupportCategory =
    | 'TICKETS'
    | 'PAYMENT'
    | 'REFUND'
    | 'EVENT_INFO'
    | 'ACCOUNT'
    | 'ORGANIZER'
    | 'SEATING'
    | 'CHECK_IN'
    | 'TECHNICAL'
    | 'EVENT_COMPLAINT'
    | 'OTHER'

export interface SupportCase {
    id: string
    case_number: number
    requester_user_id: string
    requester_name: string | null
    case_scope: 'EVENT_SUPPORT' | 'PLATFORM_SUPPORT'
    event_id: string | null
    event_title: string | null
    event_public_id: string | null
    organizer_name: string | null
    order_id: string | null
    order_number: string | null
    ticket_id: string | null
    previous_case_id: string | null
    category: SupportCategory
    custom_subject: string | null
    status: SupportCaseStatus
    assigned_to_user_id: string | null
    assignee_name: string | null
    escalated_to_platform: boolean
    resolved_at: string | null
    last_message_seq: number
    unread: number
    created_at: string
    updated_at: string
}

export interface SupportMessage {
    id: string
    seq: number
    sender_user_id: string
    sender_name: string | null
    from_requester: boolean
    body: string
    created_at: string
}

export interface SupportHistoryEntry {
    action: string
    actor_user_id: string | null
    actor_name: string | null
    old_status: string | null
    new_status: string | null
    old_assignee_user_id: string | null
    old_assignee_name: string | null
    new_assignee_user_id: string | null
    new_assignee_name: string | null
    created_at: string
}

export interface SupportCaseDetail extends SupportCase {
    messages: SupportMessage[]
    history: SupportHistoryEntry[]
}

export type SupportTab = 'UNASSIGNED' | 'MINE' | 'ALL_OPEN' | 'WITH_PLATFORM' | 'RESOLVED'

export const supportTabs: SupportTab[] = ['UNASSIGNED', 'MINE', 'ALL_OPEN', 'WITH_PLATFORM', 'RESOLVED']

export const matchesSupportTab = (supportCase: SupportCase, tab: SupportTab, myUserId: string | undefined) => {
    const isOpen = supportCase.status !== 'RESOLVED'
    switch (tab) {
        case 'UNASSIGNED':
            return isOpen && !supportCase.escalated_to_platform && supportCase.assigned_to_user_id === null
        case 'MINE':
            return isOpen && !supportCase.escalated_to_platform && supportCase.assigned_to_user_id === myUserId
        case 'ALL_OPEN':
            return isOpen
        case 'WITH_PLATFORM':
            return isOpen && supportCase.escalated_to_platform
        case 'RESOLVED':
            return !isOpen
    }
}

export const caseNumber = (supportCase: Pick<SupportCase, 'case_number'>) => `#${supportCase.case_number}`

export const supportCasesKey = (eventId: string | undefined) => ['organizer-events', eventId, 'support-cases']

export const supportCaseKey = (caseId: string | undefined) => ['support-cases', caseId]

export const useEventSupportCases = (eventId: string | undefined) =>
    useQuery({
        queryKey: supportCasesKey(eventId),
        queryFn: () => api<SupportCase[]>(`/events/${eventId}/support/cases`),
        enabled: Boolean(eventId),
    })

export const useSupportCase = (caseId: string | undefined) =>
    useQuery({
        queryKey: supportCaseKey(caseId),
        queryFn: () => api<SupportCaseDetail>(`/support/cases/${caseId}`),
        enabled: Boolean(caseId),
    })

export const claimCase = (caseId: string) => api<SupportCaseDetail>(`/support/cases/${caseId}/claim`, { method: 'POST' })

export const releaseCase = (caseId: string) => api<SupportCaseDetail>(`/support/cases/${caseId}/release`, { method: 'POST' })

export const escalateCase = (caseId: string) => api<SupportCaseDetail>(`/support/cases/${caseId}/escalate`, { method: 'POST' })

export const assignCase = (caseId: string, userId: string) =>
    api<SupportCaseDetail>(`/support/cases/${caseId}/assign`, { method: 'POST', json: { user_id: userId } })

export const changeCaseStatus = (caseId: string, status: Exclude<SupportCaseStatus, 'OPEN'>) =>
    api<SupportCaseDetail>(`/support/cases/${caseId}/status`, { method: 'POST', json: { status } })

export const sendCaseMessage = (caseId: string, body: string, clientMessageId: string) =>
    api<SupportCaseDetail>(`/support/cases/${caseId}/messages`, { method: 'POST', json: { body, client_message_id: clientMessageId } })

export const markCaseRead = (caseId: string, upToSeq: number) =>
    api<SupportCase>(`/support/cases/${caseId}/read`, { method: 'POST', json: { up_to_seq: upToSeq } })

export interface CaseAssignee {
    user_id: string
    full_name: string | null
    roles: string[]
    is_current: boolean
}

export const useCaseAssignees = (caseId: string, enabled: boolean) =>
    useQuery({
        queryKey: ['support-cases', caseId, 'assignees'],
        queryFn: () => api<CaseAssignee[]>(`/support/cases/${caseId}/assignees`),
        enabled,
    })

export const useCaseOrder = (eventId: string | undefined, supportCase: Pick<SupportCase, 'order_id'>) =>
    useEventOrderDetail(eventId, supportCase.order_id ?? undefined).data
