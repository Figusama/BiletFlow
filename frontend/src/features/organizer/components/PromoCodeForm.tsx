import { useState, type FormEvent } from 'react'
import Button from '../../../components/ui/Button'
import FormField from '../../../components/ui/FormField'
import Input from '../../../components/ui/Input'
import { ApiError } from '../../../shared/api/client'
import { useLanguage } from '../../../shared/i18n/language'
import { fromDateTimeInput, toDateTimeInput } from '../../../shared/lib/date'
import ChoiceCards from '../../applications/components/ChoiceCards'
import { createCampaign, createPromoCode, type DiscountType, type ManagedEvent, type ManagedTicketType, type PromoScope } from '../api'

interface PromoCodeFormState {
    campaignName: string
    code: string
    discountType: DiscountType
    value: string
    scope: PromoScope
    ticketTypeIds: string[]
    maxRedemptions: string
    validFrom: string
    validUntil: string
}

const WHOLE_NUMBER = /^[1-9]\d*$/
const CODE_PATTERN = /^[A-Za-z0-9_-]{3,32}$/

interface PromoCodeFormProps {
    event: ManagedEvent
    ticketTypes: ManagedTicketType[]
    onDone: (saved: boolean) => void
}

const PromoCodeForm = ({ event, ticketTypes, onDone }: PromoCodeFormProps) => {
    const { t } = useLanguage()
    const texts = t.organizerPromo.form
    const [form, setForm] = useState<PromoCodeFormState>(() => ({
        campaignName: '',
        code: '',
        discountType: 'PERCENTAGE',
        value: '',
        scope: 'ORDER',
        ticketTypeIds: [],
        maxRedemptions: '',
        validFrom: toDateTimeInput(new Date().toISOString(), event.timezone),
        validUntil: toDateTimeInput(event.starts_at, event.timezone),
    }))
    const [showErrors, setShowErrors] = useState(false)
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')

    const update = <K extends keyof PromoCodeFormState>(key: K, value: PromoCodeFormState[K]) =>
        setForm((current) => ({ ...current, [key]: value }))

    const toggleType = (id: string) =>
        update('ticketTypeIds', form.ticketTypeIds.includes(id) ? form.ticketTypeIds.filter((item) => item !== id) : [...form.ticketTypeIds, id])

    const validFrom = fromDateTimeInput(form.validFrom, event.timezone)
    const validUntil = fromDateTimeInput(form.validUntil, event.timezone)

    const errors: Partial<Record<keyof PromoCodeFormState, string>> = {}
    if (form.code && !CODE_PATTERN.test(form.code)) errors.code = texts.invalidCode
    if (!WHOLE_NUMBER.test(form.value)) errors.value = texts.invalidNumber
    else if (form.discountType === 'PERCENTAGE' && Number(form.value) > 100) errors.value = texts.percentTooHigh
    if (form.scope === 'SELECTED_TICKET_TYPES' && form.ticketTypeIds.length === 0) errors.ticketTypeIds = texts.pickTypes
    if (form.maxRedemptions && !WHOLE_NUMBER.test(form.maxRedemptions)) errors.maxRedemptions = texts.invalidNumber
    if (!validFrom) errors.validFrom = texts.required
    if (!validUntil) errors.validUntil = texts.required
    else if (validFrom && validUntil <= validFrom) errors.validUntil = texts.endBeforeStart

    const errorFor = (key: keyof PromoCodeFormState) => (showErrors ? errors[key] : undefined)

    const handleSubmit = async (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        if (Object.keys(errors).length > 0) {
            setShowErrors(true)
            return
        }
        setIsBusy(true)
        setError('')
        try {
            const campaign = form.campaignName.trim() ? await createCampaign(event.id, form.campaignName.trim()) : null
            await createPromoCode(event.id, {
                code: form.code.trim() || null,
                campaign_id: campaign?.id ?? null,
                discount_type: form.discountType,
                percentage_bps: form.discountType === 'PERCENTAGE' ? Number(form.value) * 100 : null,
                fixed_amount_minor: form.discountType === 'FIXED_AMOUNT' ? Number(form.value) * 100 : null,
                application_scope: form.scope,
                ticket_type_ids: form.scope === 'SELECTED_TICKET_TYPES' ? form.ticketTypeIds : [],
                max_redemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
                valid_from: validFrom ?? '',
                valid_until: validUntil ?? '',
            })
            onDone(true)
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 409 ? texts.codeTaken : texts.saveFailed)
            setIsBusy(false)
        }
    }

    return (
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-lg font-bold text-foreground">{texts.title}</h2>

            <div className="grid gap-5 sm:grid-cols-2">
                <FormField label={texts.campaignName} htmlFor="promo-campaign" hint={texts.campaignHint}>
                    <Input
                        id="promo-campaign"
                        value={form.campaignName}
                        maxLength={120}
                        onChange={(changeEvent) => update('campaignName', changeEvent.target.value)}
                    />
                </FormField>
                <FormField label={texts.code} htmlFor="promo-code" error={errorFor('code')} hint={texts.codeHint}>
                    <Input
                        id="promo-code"
                        value={form.code}
                        maxLength={32}
                        hasError={Boolean(errorFor('code'))}
                        onChange={(changeEvent) => update('code', changeEvent.target.value.toUpperCase())}
                    />
                </FormField>
            </div>

            <ChoiceCards
                name="promo-discount-type"
                label={texts.discountType}
                value={form.discountType}
                choices={[
                    { value: 'PERCENTAGE', label: t.organizerPromo.discountTypes.PERCENTAGE, description: texts.percentageText },
                    { value: 'FIXED_AMOUNT', label: t.organizerPromo.discountTypes.FIXED_AMOUNT, description: texts.fixedText },
                ]}
                onChange={(discountType) => update('discountType', discountType)}
            />

            <div className="grid gap-5 sm:grid-cols-2">
                <FormField label={form.discountType === 'PERCENTAGE' ? texts.valuePercent : texts.valueFixed} htmlFor="promo-value" error={errorFor('value')}>
                    <Input
                        id="promo-value"
                        inputMode="numeric"
                        value={form.value}
                        hasError={Boolean(errorFor('value'))}
                        onChange={(changeEvent) => update('value', changeEvent.target.value.replace(/\D/g, ''))}
                    />
                </FormField>
                <FormField label={texts.maxRedemptions} htmlFor="promo-max" error={errorFor('maxRedemptions')} hint={texts.maxHint}>
                    <Input
                        id="promo-max"
                        inputMode="numeric"
                        value={form.maxRedemptions}
                        hasError={Boolean(errorFor('maxRedemptions'))}
                        onChange={(changeEvent) => update('maxRedemptions', changeEvent.target.value.replace(/\D/g, ''))}
                    />
                </FormField>
            </div>

            <ChoiceCards
                name="promo-scope"
                label={texts.scope}
                value={form.scope}
                choices={[
                    { value: 'ORDER', label: t.organizerPromo.scopes.ORDER, description: texts.orderText },
                    { value: 'SELECTED_TICKET_TYPES', label: t.organizerPromo.scopes.SELECTED_TICKET_TYPES, description: texts.selectedText },
                ]}
                onChange={(scope) => update('scope', scope)}
            />

            {form.scope === 'SELECTED_TICKET_TYPES' && (
                <fieldset>
                    <legend className="text-sm font-medium text-foreground">{texts.ticketTypes}</legend>
                    <div className="mt-2 flex flex-wrap gap-3">
                        {ticketTypes.map((type) => (
                            <label key={type.id} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                                <input
                                    type="checkbox"
                                    checked={form.ticketTypeIds.includes(type.id)}
                                    onChange={() => toggleType(type.id)}
                                    className="size-4 accent-accent"
                                />
                                {type.name}
                            </label>
                        ))}
                    </div>
                    {errorFor('ticketTypeIds') && <p className="mt-2 text-sm text-error">{errorFor('ticketTypeIds')}</p>}
                </fieldset>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
                <FormField label={texts.validFrom} htmlFor="promo-from" error={errorFor('validFrom')}>
                    <Input
                        id="promo-from"
                        type="datetime-local"
                        value={form.validFrom}
                        hasError={Boolean(errorFor('validFrom'))}
                        onChange={(changeEvent) => update('validFrom', changeEvent.target.value)}
                    />
                </FormField>
                <FormField label={texts.validUntil} htmlFor="promo-until" error={errorFor('validUntil')}>
                    <Input
                        id="promo-until"
                        type="datetime-local"
                        value={form.validUntil}
                        hasError={Boolean(errorFor('validUntil'))}
                        onChange={(changeEvent) => update('validUntil', changeEvent.target.value)}
                    />
                </FormField>
            </div>

            {error && (
                <p role="alert" className="text-sm text-error">
                    {error}
                </p>
            )}

            <div className="flex flex-wrap gap-3">
                <Button type="submit" shape="pill" disabled={isBusy}>
                    {texts.create}
                </Button>
                <Button type="button" variant="secondary" shape="pill" disabled={isBusy} onClick={() => onDone(false)}>
                    {texts.cancel}
                </Button>
            </div>
        </form>
    )
}

export default PromoCodeForm
