import type { BadgeIcon, BadgeTone } from '../../components/ui/StatusBadge'
import type { RefundExecutionStatus, RefundRequestStatus } from '../organizer/api'
import type { RefundAttemptStatus } from './api'

type Badge = { tone: BadgeTone; icon: BadgeIcon }

export const decisionBadge: Record<RefundRequestStatus, Badge> = {
    PENDING: { tone: 'warning', icon: 'clock' },
    PENDING_ADMIN: { tone: 'warning', icon: 'clock' },
    APPROVED: { tone: 'success', icon: 'check-circle' },
    REJECTED: { tone: 'danger', icon: 'x-circle' },
    WITHDRAWN: { tone: 'neutral', icon: 'ban' },
}

export const executionBadge: Record<RefundExecutionStatus, Badge> = {
    NOT_STARTED: { tone: 'neutral', icon: 'clock' },
    IN_PROGRESS: { tone: 'neutral', icon: 'clock' },
    SUCCEEDED: { tone: 'success', icon: 'check-circle' },
    FAILED_FINAL: { tone: 'danger', icon: 'x-circle' },
}

export const attemptBadge: Record<RefundAttemptStatus, Badge> = {
    PENDING: { tone: 'neutral', icon: 'clock' },
    PROCESSING: { tone: 'neutral', icon: 'clock' },
    SUCCEEDED: { tone: 'success', icon: 'check-circle' },
    FAILED: { tone: 'danger', icon: 'x-circle' },
    UNKNOWN: { tone: 'warning', icon: 'clock' },
}
