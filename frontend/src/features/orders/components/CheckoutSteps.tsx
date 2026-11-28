import { useLanguage } from '../../../shared/i18n/language'

const CheckoutSteps = ({ current }: { current: number }) => {
    const { t } = useLanguage()

    return (
        <ol className="flex items-center gap-2 text-sm">
            {t.ticketSelection.steps.map((step, index) => {
                const isCurrent = index === current
                const isDone = index < current

                return (
                    <li key={step} className="flex items-center gap-2">
                        {index > 0 && <span aria-hidden="true" className="h-px w-6 bg-border-strong" />}
                        <span
                            aria-current={isCurrent ? 'step' : undefined}
                            className={`grid size-6 place-items-center rounded-full text-xs font-bold ${
                                isCurrent || isDone ? 'bg-accent text-accent-foreground' : 'bg-surface-sunk text-muted'
                            }`}
                        >
                            {index + 1}
                        </span>
                        <span className={isCurrent ? 'font-semibold text-foreground' : 'text-muted'}>{step}</span>
                    </li>
                )
            })}
        </ol>
    )
}

export default CheckoutSteps
