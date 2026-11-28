import { useState, type FormEvent } from 'react'
import Button from '../../../components/ui/Button'
import FormField from '../../../components/ui/FormField'
import Input from '../../../components/ui/Input'
import PhoneInput from '../../../components/ui/PhoneInput'
import { useLanguage } from '../../../shared/i18n/language'
import { validateKzMobilePhone } from '../../../shared/lib/phone'
import ChoiceCards from '../../applications/components/ChoiceCards'
import { submitPaidSalesRequest, type PaidSales, type PayoutOwnerType } from '../api'

interface PayoutForm {
    ownerType: PayoutOwnerType
    ownerName: string
    identifier: string
    responsible: string
    email: string
    phone: string
    bank: string
    iban: string
    holder: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const IBAN_PATTERN = /^KZ\d{2}[A-Z0-9]{16}$/

const emptyForm: PayoutForm = {
    ownerType: 'INDIVIDUAL',
    ownerName: '',
    identifier: '',
    responsible: '',
    email: '',
    phone: '',
    bank: '',
    iban: '',
    holder: '',
}

interface PaidSalesFormProps {
    eventId: string
    termsVersion: string
    onSubmitted: (paidSales: PaidSales) => void
}

const PaidSalesForm = ({ eventId, termsVersion, onSubmitted }: PaidSalesFormProps) => {
    const { t } = useLanguage()
    const texts = t.organizerPaidSales.form
    const [form, setForm] = useState(emptyForm)
    const [acceptedTerms, setAcceptedTerms] = useState(false)
    const [showErrors, setShowErrors] = useState(false)
    const [isSending, setIsSending] = useState(false)
    const [error, setError] = useState('')

    const update = (key: keyof PayoutForm, value: string) => setForm((current) => ({ ...current, [key]: value }))
    const isIndividual = form.ownerType === 'INDIVIDUAL'
    const iban = form.iban.replace(/\s/g, '').toUpperCase()

    const errors: Partial<Record<keyof PayoutForm | 'terms', string>> = {}
    if (form.ownerName.trim().length < 2) errors.ownerName = texts.required
    if (!/^\d{12}$/.test(form.identifier)) errors.identifier = texts.invalidIdentifier
    if (form.responsible.trim().length < 2) errors.responsible = texts.required
    if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = texts.invalidEmail
    if (validateKzMobilePhone(form.phone) !== true) errors.phone = texts.invalidPhone
    if (form.bank.trim().length < 2) errors.bank = texts.required
    if (!IBAN_PATTERN.test(iban)) errors.iban = texts.invalidIban
    if (form.holder.trim().length < 2) errors.holder = texts.required
    if (!acceptedTerms) errors.terms = texts.acceptTerms

    const errorFor = (key: keyof typeof errors) => (showErrors ? errors[key] : undefined)

    const handleSubmit = async (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        if (Object.keys(errors).length > 0) {
            setShowErrors(true)
            return
        }
        setIsSending(true)
        setError('')
        try {
            onSubmitted(
                await submitPaidSalesRequest(eventId, {
                    owner_type: form.ownerType,
                    owner_name: form.ownerName.trim(),
                    identifier: form.identifier,
                    responsible_person_name: form.responsible.trim(),
                    contact_email: form.email.trim(),
                    contact_phone: `+${form.phone}`,
                    iban,
                    bank_name: form.bank.trim(),
                    account_holder_name: form.holder.trim(),
                }),
            )
        } catch {
            setError(texts.failed)
            setIsSending(false)
        }
    }

    const field = (key: keyof PayoutForm, label: string, props: { hint?: string; inputMode?: 'numeric'; maxLength?: number; type?: string } = {}) => (
        <FormField label={label} htmlFor={`payout-${key}`} error={errorFor(key)} hint={props.hint}>
            <Input
                id={`payout-${key}`}
                type={props.type}
                inputMode={props.inputMode}
                maxLength={props.maxLength ?? 200}
                value={form[key]}
                hasError={Boolean(errorFor(key))}
                onChange={(changeEvent) => update(key, props.inputMode === 'numeric' ? changeEvent.target.value.replace(/\D/g, '') : changeEvent.target.value)}
            />
        </FormField>
    )

    return (
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-bold text-foreground">{texts.title}</h2>

            <ChoiceCards
                name="payout-owner-type"
                label={texts.ownerType}
                value={form.ownerType}
                choices={[
                    { value: 'INDIVIDUAL', label: texts.individual, description: texts.individualText },
                    { value: 'LEGAL_ENTITY', label: texts.legalEntity, description: texts.legalEntityText },
                ]}
                onChange={(ownerType) => update('ownerType', ownerType)}
            />

            <div className="grid gap-5 sm:grid-cols-2">
                {field('ownerName', isIndividual ? texts.ownerNameIndividual : texts.ownerNameLegal)}
                {field('identifier', isIndividual ? texts.identifierIndividual : texts.identifierLegal, {
                    hint: texts.identifierHint,
                    inputMode: 'numeric',
                    maxLength: 12,
                })}
            </div>

            {field('responsible', texts.responsible, { hint: texts.responsibleHint })}

            <div className="grid gap-5 sm:grid-cols-2">
                {field('email', texts.email, { type: 'email' })}
                <FormField label={texts.phone} htmlFor="payout-phone" error={errorFor('phone')}>
                    <PhoneInput
                        id="payout-phone"
                        name="payout-phone"
                        value={form.phone}
                        hasError={Boolean(errorFor('phone'))}
                        onChange={(value) => {
                            if (value !== form.phone) update('phone', value)
                        }}
                        onBlur={() => undefined}
                        inputRef={() => undefined}
                    />
                </FormField>
            </div>

            <h3 className="mt-2 border-t border-border pt-5 text-base font-bold text-foreground">{texts.payoutTitle}</h3>

            <div className="grid gap-5 sm:grid-cols-2">
                {field('bank', texts.bank)}
                {field('iban', texts.iban, { hint: texts.ibanHint, maxLength: 34 })}
            </div>

            {field('holder', texts.holder)}

            <div>
                <label className="flex cursor-pointer items-start gap-3">
                    <input
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(changeEvent) => setAcceptedTerms(changeEvent.target.checked)}
                        className="mt-0.5 size-5 shrink-0 accent-accent"
                    />
                    <span className="text-sm text-foreground">{texts.terms(termsVersion)}</span>
                </label>
                {errorFor('terms') && <p className="mt-2 text-sm text-error">{errorFor('terms')}</p>}
            </div>

            <div className="rounded-2xl bg-info-soft p-4">
                <p className="text-sm font-semibold text-foreground">{texts.protectedTitle}</p>
                <p className="mt-1 text-sm text-muted">{texts.protectedText}</p>
            </div>

            {error && (
                <p role="alert" className="text-sm text-error">
                    {error}
                </p>
            )}

            <div>
                <Button type="submit" shape="pill" disabled={isSending}>
                    {isSending ? texts.submitting : texts.submit}
                </Button>
            </div>
        </form>
    )
}

export default PaidSalesForm
