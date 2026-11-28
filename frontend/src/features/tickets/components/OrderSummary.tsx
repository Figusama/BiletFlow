import Button from '../../../components/ui/Button'
import { useLanguage } from '../../../shared/i18n/language'
import { formatKzt } from '../../../shared/lib/money'
export interface SummaryItem {
    key: string
    label: string
    price: number
}

interface OrderSummaryProps {
    items: SummaryItem[]
    isSignedIn: boolean
    isSubmitting: boolean
    error: string
    onContinue: () => void
}

const OrderSummary = ({ items, isSignedIn, isSubmitting, error, onContinue }: OrderSummaryProps) => {
    const { t } = useLanguage()
    const total = items.reduce((sum, item) => sum + item.price, 0)
    const formatPrice = (minor: number) => (minor === 0 ? t.discover.free : formatKzt(minor))

    return (
        <section aria-labelledby="summary-title" className="rounded-2xl border border-border bg-surface p-5">
            <h2 id="summary-title" className="text-base font-bold text-foreground">
                {t.ticketSelection.summary}
            </h2>

            {items.length === 0 ? (
                <p className="mt-4 text-sm text-muted">{t.ticketSelection.empty}</p>
            ) : (
                <ul className="mt-4 flex flex-col gap-2 text-sm">
                    {items.map(({ key, label, price }) => (
                        <li key={key} className="flex justify-between gap-3">
                            <span className="text-foreground">{label}</span>
                            <span className="font-semibold whitespace-nowrap text-foreground">{formatPrice(price)}</span>
                        </li>
                    ))}
                </ul>
            )}

            <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-border pt-5">
                <span className="text-sm text-muted">{t.tickets.total}</span>
                <span className="text-2xl font-bold text-foreground">{items.length > 0 ? formatPrice(total) : '—'}</span>
            </div>

            {error && (
                <p role="alert" className="mt-4 text-sm font-medium text-error">
                    {error}
                </p>
            )}

            <Button
                type="button"
                fullWidth
                shape="pill"
                disabled={items.length === 0 || isSubmitting}
                onClick={onContinue}
                className="mt-5 min-h-11"
            >
                {isSubmitting ? t.tickets.reserving : isSignedIn ? t.ticketSelection.continue : t.tickets.signInToBuy}
            </Button>

            <p className="mt-3 text-center text-xs text-muted">{t.tickets.holdNote}</p>
        </section>
    )
}

export default OrderSummary
