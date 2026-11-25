import StatusBadge, { type BadgeIcon, type BadgeTone } from '../../../components/ui/StatusBadge'
import { useLanguage } from '../../../shared/i18n/language'
import type { SupportCase } from '../support'

const badgeOf = (supportCase: SupportCase): { tone: BadgeTone; icon: BadgeIcon } => {
    if (supportCase.status === 'RESOLVED') return { tone: 'success', icon: 'check-circle' }
    if (supportCase.status === 'OPEN' && !supportCase.escalated_to_platform) return { tone: 'warning', icon: 'clock' }
    return { tone: 'neutral', icon: 'clock' }
}

interface SupportStatusBadgeProps {
    supportCase: SupportCase
    assigneeLabel?: string
}

const SupportStatusBadge = ({ supportCase, assigneeLabel }: SupportStatusBadgeProps) => {
    const { t } = useLanguage()
    const texts = t.organizerSupport
    const badge = badgeOf(supportCase)
    const label = supportCase.escalated_to_platform && supportCase.status !== 'RESOLVED' ? texts.withPlatform : texts.status[supportCase.status]

    return (
        <StatusBadge tone={badge.tone} icon={badge.icon}>
            {assigneeLabel ? `${label}, ${assigneeLabel}` : label}
        </StatusBadge>
    )
}

export default SupportStatusBadge
