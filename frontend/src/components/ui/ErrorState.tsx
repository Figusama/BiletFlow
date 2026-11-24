import type { ReactNode } from 'react'

interface ErrorStateProps {
    visual: ReactNode
    title: string
    text: string
    children: ReactNode
}

export const primaryActionClass =
    'inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

export const secondaryActionClass =
    'inline-flex h-11 items-center rounded-full border border-border-strong px-6 text-sm font-semibold text-foreground hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const ErrorState = ({ visual, title, text, children }: ErrorStateProps) => (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
        <div className="text-accent">{visual}</div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="mt-3 leading-6 text-muted">{text}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>
    </div>
)

export default ErrorState
