import StatusBadge, { type BadgeIcon, type BadgeTone } from '../../../components/ui/StatusBadge'
import { useLanguage } from '../../../shared/i18n/language'
import type { SupportCase } from '../../organizer/support'

const badgeOf = (supportCase: SupportCase): { tone: BadgeTone; icon: BadgeIcon } => {
    if (supportCase.status === 'RESOLVED') return { tone: 'success', icon: 'check-circle' }
    if (supportCase.status === 'WAITING_FOR_CUSTOMER') return { tone: 'warning', icon: 'clock' }
    return { tone: 'neutral', icon: 'clock' }
}

const BuyerCaseStatusBadge = ({ supportCase }: { supportCase: SupportCase }) => {
    const { t } = useLanguage()
    const badge = badgeOf(supportCase)

    return (
        <StatusBadge tone={badge.tone} icon={badge.icon}>
            {t.buyerSupport.status[supportCase.status]}
        </StatusBadge>
    )
}

export default BuyerCaseStatusBadge
