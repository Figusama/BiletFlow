import type { ReactNode } from 'react'
import { CheckCircleIcon } from './icons'

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral'

const toneClass: Record<BadgeTone, string> = {
    success: 'bg-badge-success-bg text-badge-success-fg',
    warning: 'bg-badge-warning-bg text-badge-warning-fg',
    danger: 'bg-badge-danger-bg text-badge-danger-fg',
    neutral: 'bg-badge-neutral-bg text-badge-neutral-fg',
}

const toneIcon: Partial<Record<BadgeTone, ReactNode>> = {
    success: <CheckCircleIcon className="size-3.5" />,
}

interface StatusBadgeProps {
    tone: BadgeTone
    children: ReactNode
}

const StatusBadge = ({ tone, children }: StatusBadgeProps) => (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${toneClass[tone]}`}>
        {toneIcon[tone]}
        {children}
    </span>
)

export default StatusBadge
