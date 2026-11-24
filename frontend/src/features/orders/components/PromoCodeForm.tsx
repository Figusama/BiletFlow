import { useState, type FormEvent } from 'react'
import Button from '../../../components/ui/Button'
import Input from '../../../components/ui/Input'
import { useLanguage } from '../../../shared/i18n/language'
import { validatePromo, type PromoQuote } from '../api'

interface PromoCodeFormProps {
    reservationId: string
    quote: PromoQuote | null
    onChange: (quote: PromoQuote | null) => void
}

const PromoCodeForm = ({ reservationId, quote, onChange }: PromoCodeFormProps) => {
    const { t } = useLanguage()
    const [code, setCode] = useState('')
    const [error, setError] = useState('')
    const [isChecking, setIsChecking] = useState(false)

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const trimmed = code.trim()
        if (!trimmed) return

        setIsChecking(true)
        setError('')

        try {
            const result = await validatePromo(reservationId, trimmed)
            if (result.valid) {
                onChange(result)
                setCode('')
            } else {
                setError(t.checkout.promoInvalid)
            }
        } catch {
            setError(t.checkout.promoInvalid)
        } finally {
            setIsChecking(false)
        }
    }

    if (quote) {
        return (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-badge-success-bg px-4 py-3 text-sm text-badge-success-fg">
                <span className="font-semibold">{t.checkout.promoApplied(quote.code)}</span>
                <button type="button" onClick={() => onChange(null)} className="font-semibold hover:underline">
                    {t.checkout.removePromo}
                </button>
            </div>
        )
    }

    return (
        <form onSubmit={handleSubmit}>
            <label htmlFor="promo-code" className="text-sm font-semibold text-foreground">
                {t.checkout.promoLabel}
            </label>
            <div className="mt-2 flex gap-2">
                <Input
                    id="promo-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    hasError={Boolean(error)}
                    autoComplete="off"
                    className="uppercase"
                />
                <Button type="submit" variant="secondary" disabled={isChecking || !code.trim()} className="shrink-0">
                    {t.checkout.apply}
                </Button>
            </div>
            {error && (
                <p role="alert" className="mt-2 text-sm text-error">
                    {error}
                </p>
            )}
        </form>
    )
}

export default PromoCodeForm
