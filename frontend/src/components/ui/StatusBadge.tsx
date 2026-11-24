import type { ReactNode } from 'react'
import Icon, { type IconName } from './Icon'

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral'
export type BadgeIcon = IconName

const toneClass: Record<BadgeTone, string> = {
    success: 'bg-badge-success-bg text-badge-success-fg',
    warning: 'bg-badge-warning-bg text-badge-warning-fg',
    danger: 'bg-badge-danger-bg text-badge-danger-fg',
    neutral: 'bg-badge-neutral-bg text-badge-neutral-fg',
}

interface StatusBadgeProps {
    tone: BadgeTone
    icon?: BadgeIcon
    children: ReactNode
}

const StatusBadge = ({ tone, icon, children }: StatusBadgeProps) => (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${toneClass[tone]}`}>
        {icon && <Icon name={icon} className="size-3.5" />}
        {children}
    </span>
)

export default StatusBadge
