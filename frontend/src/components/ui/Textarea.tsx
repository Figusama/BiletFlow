import type { TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    hasError?: boolean
}

const Textarea = ({ hasError = false, className = '', ...props }: TextareaProps) => (
    <textarea
        className={`min-h-32 w-full rounded-[14px] border bg-surface px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:ring-2 ${hasError ? 'border-error focus:ring-error/20' : 'border-border focus:border-accent focus:ring-accent/20'} ${className}`}
        {...props}
    />
)

export default Textarea
