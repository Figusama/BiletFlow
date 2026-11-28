import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'night'
type ButtonSize = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	children: ReactNode
	variant?: ButtonVariant
	size?: ButtonSize
	fullWidth?: boolean
	shape?: 'default' | 'pill'
}

const Button = ({
	children,
	variant = 'primary',
	size = 'md',
	fullWidth = false,
	className = '',
	shape = 'default',
	...props
}: ButtonProps) => {
	const baseStyles = `
		inline-flex items-center justify-center
		${shape === 'pill' ? 'rounded-full' : 'rounded-lg'} font-semibold
		transition
		disabled:cursor-not-allowed
		disabled:opacity-40
		focus-visible:outline-none
		focus-visible:ring-2
		focus-visible:ring-accent
		focus-visible:ring-offset-2
		focus-visible:ring-offset-background
	`

	const variantStyles = {
		primary: `
			bg-accent text-accent-foreground
			hover:bg-accent-hover
		`,
		night: `
			bg-night text-on-night
			hover:opacity-90
		`,
		secondary: `
			border border-border
			bg-surface text-foreground
			hover:bg-surface-sunk
		`,
	}

	const sizeStyles = {
		sm: 'px-3 py-2 text-sm',
		md: 'px-4 py-3 text-sm',
	}

	return (
		<button
			className={`
				${baseStyles}
				${variantStyles[variant]}
				${sizeStyles[size]}
				${fullWidth ? 'w-full' : ''}
				${className}
			`}
			{...props}
		>
			{children}
		</button>
	)
}

export default Button