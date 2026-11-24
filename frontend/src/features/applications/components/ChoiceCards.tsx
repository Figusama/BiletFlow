interface Choice<T extends string> {
    value: T
    label: string
    description: string
}

interface ChoiceCardsProps<T extends string> {
    name: string
    label: string
    hint?: string
    value: T
    choices: Choice<T>[]
    onChange: (value: T) => void
}

const ChoiceCards = <T extends string>({ name, label, hint, value, choices, onChange }: ChoiceCardsProps<T>) => (
    <div role="radiogroup" aria-label={label}>
        <p className="text-sm font-medium text-foreground">
            {label}
            {hint && <span className="ml-2 font-normal text-muted">{hint}</span>}
        </p>
        <div className={`mt-2 grid gap-3 ${choices.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {choices.map((choice) => {
                const isChecked = choice.value === value
                return (
                    <label
                        key={choice.value}
                        className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors has-disabled:cursor-default ${isChecked ? 'border-accent bg-accent-soft' : 'border-border hover:border-border-strong'}`}
                    >
                        <input
                            type="radio"
                            name={name}
                            value={choice.value}
                            checked={isChecked}
                            onChange={() => onChange(choice.value)}
                            className="mt-0.5 size-4 shrink-0 accent-accent"
                        />
                        <span>
                            <span className="block text-sm font-semibold text-foreground">{choice.label}</span>
                            <span className="mt-0.5 block text-xs text-muted">{choice.description}</span>
                        </span>
                    </label>
                )
            })}
        </div>
    </div>
)

export default ChoiceCards
