import type { ReactNode } from 'react'

interface FormSectionProps {
    number: number
    title: string
    hint?: string
    children: ReactNode
}

const FormSection = ({ number, title, hint, children }: FormSectionProps) => (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-base font-bold text-foreground">
            <span className="mr-2 text-muted">{number}</span>
            {title}
        </h2>
        {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
        <div className="mt-5 flex flex-col gap-5">{children}</div>
    </section>
)

export default FormSection
