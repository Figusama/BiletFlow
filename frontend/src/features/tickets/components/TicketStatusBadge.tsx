import StatusBadge, { type BadgeIcon, type BadgeTone } from '../../../components/ui/StatusBadge'
import { useLanguage } from '../../../shared/i18n/language'
import type { TicketStatus } from '../api'

const statusBadge: Record<TicketStatus, { tone: BadgeTone; icon: BadgeIcon }> = {
    VALID: { tone: 'success', icon: 'check-circle' },
    CHECKED_IN: { tone: 'neutral', icon: 'check-circle' },
    CANCELLED: { tone: 'danger', icon: 'x-circle' },
    REFUNDED: { tone: 'neutral', icon: 'ban' },
}

const TicketStatusBadge = ({ status }: { status: TicketStatus }) => {
    const { t } = useLanguage()
    return (
        <StatusBadge {...statusBadge[status]}>
            {t.ticketsPage.statuses[status]}
        </StatusBadge>
    )
}

export default TicketStatusBadge
