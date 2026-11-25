import type { Dictionary } from '../../shared/i18n/dictionaries/en'
import { formatKzt } from '../../shared/lib/money'
import type { HistoryEntry } from './api'

export const historyDetailText = (entry: HistoryEntry, t: Dictionary): string | null => {
    const detail = t.organizerHistory.detail
    const values = entry.details
    const label = entry.entity_label
    const ticketTypeName = entry.entity_type === 'TICKET_TYPE' ? label : null
    const prefix = ticketTypeName ? `${ticketTypeName}: ` : ''
    const limit = (value: unknown) => (typeof value === 'number' ? String(value) : detail.unlimited)
    const role = (value: unknown) => t.organizerTeam.roles[value as keyof typeof t.organizerTeam.roles] ?? String(value ?? '')
    const supportStatus = (value: unknown) => t.organizerSupport.status[value as keyof typeof t.organizerSupport.status] ?? String(value ?? '')
    switch (entry.action_type) {
        case 'TICKET_PRICE_CHANGED':
            return `${prefix}${formatKzt(Number(values.old_price_minor))} → ${formatKzt(Number(values.new_price_minor))}`
        case 'TICKET_CAPACITY_CHANGED':
            return `${prefix}${limit(values.old_capacity)} → ${limit(values.new_capacity)}`
        case 'TICKET_TYPE_AVAILABILITY_CHANGED':
            return 'new_sales_status' in values
                ? `${prefix}${detail.salesStatus[values.old_sales_status as 'ACTIVE' | 'PAUSED'] ?? ''} → ${detail.salesStatus[values.new_sales_status as 'ACTIVE' | 'PAUSED'] ?? ''}`
                : `${prefix}${values.old_is_active ? detail.active : detail.inactive} → ${values.new_is_active ? detail.active : detail.inactive}`
        case 'REFUND_REQUESTED':
        case 'REFUND_APPROVED':
        case 'REFUND_REJECTED':
        case 'REFUND_FAILED_FINAL':
        case 'REFUND_ESCALATED':
        case 'REFUND_EXCEPTION_DECIDED':
            return detail.order(String(values.order_number ?? label ?? ''))
        case 'REFUND_SUCCEEDED':
            return `${detail.order(String(values.order_number ?? label ?? ''))}, ${formatKzt(Number(values.amount_minor))}`
        case 'SUPPORT_CASE_STATUS_CHANGED':
            return `${label ?? ''}, ${supportStatus(values.old_status)} → ${supportStatus(values.new_status)}`
        case 'EVENT_STAFF_INVITED':
        case 'EVENT_STAFF_INVITATION_REVOKED':
        case 'EVENT_STAFF_INVITATION_DECLINED':
        case 'EVENT_ROLE_ASSIGNED':
        case 'EVENT_ROLE_REVOKED':
            return [label, role(values.role)].filter(Boolean).join(', ')
        case 'EVENT_CHANGE_REQUEST_SUBMITTED':
        case 'EVENT_CHANGE_REQUEST_APPROVED':
            return values.request_number ? detail.request(String(values.request_number)) : null
        case 'PRIVATE_INVITATIONS_SENT':
            return detail.invitations(Number(values.count))
        default:
            return entry.entity_type === 'EVENT' || entry.entity_type === 'EVENT_USER_ROLE' ? null : label
    }
}
