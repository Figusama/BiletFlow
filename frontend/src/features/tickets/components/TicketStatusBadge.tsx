type TicketStatus = 'valid' | 'checked_in' | 'cancelled'

interface TicketStatusBadgeProps {
	status: TicketStatus
}

const statusConfig: Record<
	TicketStatus,
	{
		label: string
		className: string
	}
> = {
	valid: {
		label: 'Valid',
		className: 'border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400',
	},
	checked_in: {
		label: 'Checked in',
		className: 'border-border bg-background text-muted',
	},
	cancelled: {
		label: 'Cancelled',
		className: 'border-error/30 bg-error/10 text-error',
	},
}

const TicketStatusBadge = ({
	status,
}: TicketStatusBadgeProps) => {
	const config = statusConfig[status]

	return (
		<span
			className={`
				inline-flex items-center rounded-full border
				px-3 py-1 text-xs font-medium
				${config.className}
			`}
		>
			{config.label}
		</span>
	)
}

export default TicketStatusBadge

export type { TicketStatus }