import type { ReactNode } from 'react'

interface FormFieldProps {
	label: string
	htmlFor: string
	children: ReactNode
	error?: string
	hint?: string
	labelAction?: ReactNode
}

const FormField = ({
	label,
	htmlFor,
	children,
	error,
	hint,
	labelAction,
}: FormFieldProps) => {
	return (
		<div>
			<div className="flex items-center justify-between gap-4">
                <label
                    htmlFor={htmlFor}
                    className="text-sm font-medium text-foreground"
                >
                    {label}
                </label>

                {labelAction}
            </div>

			<div className="mt-2">
				{children}
			</div>

			{error ? (
				<p className="mt-2 text-sm text-error">
                    {error}
                </p>
			) : hint ? (
				<p className="mt-2 text-sm text-muted">
					{hint}
				</p>
			) : null}
		</div>
	)
}

export default FormField