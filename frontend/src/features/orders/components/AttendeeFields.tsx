import { useId } from 'react'
import Input from '../../../components/ui/Input'
import { useLanguage } from '../../../shared/i18n/language'

export interface AttendeeGroup {
    key: string
    ticketTypeName: string
    quantity: number
}

interface AttendeeFieldsProps {
    groups: AttendeeGroup[]
    names: Record<string, string[]>
    buyerName: string
    onChange: (key: string, index: number, value: string) => void
}

const AttendeeFields = ({ groups, names, buyerName, onChange }: AttendeeFieldsProps) => {
    const { t } = useLanguage()
    const idPrefix = useId()

    return (
        <section aria-labelledby={`${idPrefix}-title`}>
            <h2 id={`${idPrefix}-title`} className="text-lg font-bold text-foreground">
                {t.checkout.attendees}
            </h2>
            <p className="mt-1 text-sm text-muted">{t.checkout.attendeesHint}</p>

            <div className="mt-4 flex flex-col gap-3">
                {groups.flatMap(({ key, ticketTypeName, quantity }) =>
                    Array.from({ length: quantity }, (_, index) => {
                        const inputId = `${idPrefix}-${key}-${index}`
                        return (
                            <div key={inputId}>
                                <label htmlFor={inputId} className="text-sm font-semibold text-foreground">
                                    {t.checkout.ticketLabel(ticketTypeName, index + 1)}
                                </label>
                                <Input
                                    id={inputId}
                                    value={names[key]?.[index] ?? ''}
                                    onChange={(event) => onChange(key, index, event.target.value)}
                                    placeholder={buyerName}
                                    maxLength={120}
                                    autoComplete="off"
                                    className="mt-1.5"
                                />
                            </div>
                        )
                    }),
                )}
            </div>
        </section>
    )
}

export default AttendeeFields
