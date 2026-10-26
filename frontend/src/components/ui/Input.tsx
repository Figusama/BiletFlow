import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
	hasError?: boolean
}

const Input = ({
	hasError = false,
	className = '',
	...props
}: InputProps) => {
	return (
		<input
			className={`
				w-full rounded-lg border
				bg-surface px-4 py-3
				text-sm text-foreground
				outline-none transition-colors
				placeholder:text-muted
				focus:ring-2
				${hasError
					? 'border-error focus:border-error focus:ring-error/20'
					: 'border-border focus:border-accent focus:ring-accent/20'
				}
				${className}
			`}
			{...props}
		/>
	)
}

export default Input