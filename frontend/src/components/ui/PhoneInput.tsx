import { IMaskInput } from 'react-imask'

interface PhoneInputProps {
    id: string
    name: string
    value: string
    onChange: (value: string) => void
    onBlur: () => void
    inputRef: (element: HTMLInputElement | null) => void
    hasError?: boolean
}

const PhoneInput = ({
    id,
    name,
    value,
    onChange,
    onBlur,
    inputRef,
    hasError = false,
}: PhoneInputProps) => (
    <IMaskInput
        id={id}
        name={name}
        inputRef={inputRef}
        mask="+{7}-(000)-000-00-00"
        unmask={true}
        value={value}
        onAccept={(nextValue) => onChange(nextValue)}
        onBlur={onBlur}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+7-(XXX)-XXX-XX-XX"
        aria-invalid={hasError}
        className={`w-full rounded-[14px] border bg-surface px-4 py-3
            text-sm text-foreground placeholder:text-muted
            focus:outline-none focus:ring-2 focus:ring-accent/20
            min-h-12
            ${hasError ? 'border-error' : 'border-border focus:border-accent'}`}
    />
)

export default PhoneInput