import type { BadgeIcon, BadgeTone } from '../../components/ui/StatusBadge'
import type { EventStatus } from './api'

export const eventBadge: Record<EventStatus, { tone: BadgeTone; icon?: BadgeIcon }> = {
    DRAFT: { tone: 'neutral' },
    PUBLISHED: { tone: 'success', icon: 'check-circle' },
    CANCELLED: { tone: 'danger', icon: 'x-circle' },
    COMPLETED: { tone: 'neutral', icon: 'check-circle' },
}

export const suspendedBadge: { tone: BadgeTone; icon: BadgeIcon } = { tone: 'danger', icon: 'pause' }
