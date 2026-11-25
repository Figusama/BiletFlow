import type { BadgeIcon, BadgeTone } from '../../components/ui/StatusBadge'
import type { PaymentStatus } from './api'

export const paymentBadge: Record<PaymentStatus, { tone: BadgeTone; icon: BadgeIcon }> = {
    PENDING: { tone: 'warning', icon: 'clock' },
    AUTHORIZED: { tone: 'neutral', icon: 'clock' },
    CAPTURING: { tone: 'neutral', icon: 'clock' },
    SUCCEEDED: { tone: 'success', icon: 'check-circle' },
    FAILED: { tone: 'danger', icon: 'x-circle' },
    CANCELLED: { tone: 'neutral', icon: 'ban' },
}
