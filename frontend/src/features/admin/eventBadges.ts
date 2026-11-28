import type { BadgeIcon, BadgeTone } from '../../components/ui/StatusBadge'
import type { AdminEventStatus } from './api'

export const eventStatusBadge: Record<AdminEventStatus, { tone: BadgeTone; icon: BadgeIcon }> = {
    PUBLISHED: { tone: 'success', icon: 'check-circle' },
    DRAFT: { tone: 'neutral', icon: 'clock' },
    COMPLETED: { tone: 'neutral', icon: 'check-circle' },
    CANCELLED: { tone: 'danger', icon: 'x-circle' },
}
