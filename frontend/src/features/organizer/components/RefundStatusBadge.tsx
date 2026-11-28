import StatusBadge from '../../../components/ui/StatusBadge'
import { useLanguage } from '../../../shared/i18n/language'
import type { EventRefundRequest } from '../api'

const RefundStatusBadge = ({ request }: { request: EventRefundRequest }) => {
    const { t } = useLanguage()
    const texts = t.organizerRefunds

    if (request.status === 'APPROVED') {
        switch (request.execution_status) {
            case 'SUCCEEDED':
                return <StatusBadge tone="success" icon="check-circle">{texts.progress.refunded}</StatusBadge>
            case 'FAILED_FINAL':
                return (
                    <StatusBadge tone="danger" icon="x-circle">
                        {request.source === 'ORGANIZER_INITIATED' ? texts.progress.declinedRetry : texts.progress.declined}
                    </StatusBadge>
                )
            case 'IN_PROGRESS':
                return <StatusBadge tone="neutral" icon="clock">{texts.progress.sentToBank}</StatusBadge>
            default:
                return <StatusBadge tone="neutral" icon="clock">{texts.progress.waiting}</StatusBadge>
        }
    }

    return <StatusBadge tone={request.status === 'REJECTED' ? 'danger' : 'neutral'}>{texts.status[request.status]}</StatusBadge>
}

export default RefundStatusBadge
