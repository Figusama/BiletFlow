import type { BadgeIcon, BadgeTone } from '../../components/ui/StatusBadge'
import type { ApplicationStatus } from './api'

export const applicationBadge: Record<ApplicationStatus, { tone: BadgeTone; icon?: BadgeIcon }> = {
    DRAFT: { tone: 'neutral' },
    PENDING: { tone: 'warning', icon: 'clock' },
    APPROVED: { tone: 'success', icon: 'check-circle' },
    REJECTED: { tone: 'danger', icon: 'x-circle' },
    WITHDRAWN: { tone: 'neutral', icon: 'ban' },
}
