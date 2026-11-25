import type { BadgeIcon, BadgeTone } from '../../components/ui/StatusBadge'
import type { AdminActivation } from './api'

export const activationBadge: Record<AdminActivation['status'], { tone: BadgeTone; icon: BadgeIcon }> = {
    NOT_REQUESTED: { tone: 'neutral', icon: 'clock' },
    PENDING_VERIFICATION: { tone: 'warning', icon: 'clock' },
    FEE_PENDING: { tone: 'warning', icon: 'clock' },
    ACTIVE: { tone: 'success', icon: 'check-circle' },
    SUSPENDED: { tone: 'danger', icon: 'x-circle' },
}
