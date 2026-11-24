import StatusBadge, { type BadgeTone } from '../../../components/ui/StatusBadge'
import { useLanguage } from '../../../shared/i18n/language'
import type { TicketStatus } from '../api'

const statusTone: Record<TicketStatus, BadgeTone> = {
    VALID: 'success',
    CHECKED_IN: 'neutral',
    CANCELLED: 'danger',
    REFUNDED: 'neutral',
}

const TicketStatusBadge = ({ status }: { status: TicketStatus }) => {
    const { t } = useLanguage()
    return <StatusBadge tone={statusTone[status]}>{t.ticketsPage.statuses[status]}</StatusBadge>
}

export default TicketStatusBadge
