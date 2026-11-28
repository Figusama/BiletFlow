import { useState, type FormEvent } from 'react'
import Button from '../../../components/ui/Button'
import FormField from '../../../components/ui/FormField'
import Input from '../../../components/ui/Input'
import PhoneInput from '../../../components/ui/PhoneInput'
import Select from '../../../components/ui/Select'
import Textarea from '../../../components/ui/Textarea'
import { useLanguage } from '../../../shared/i18n/language'
import { validateKzMobilePhone } from '../../../shared/lib/phone'
import { updateEvent, type EventUpdate, type EventVisibility, type ManagedEvent } from '../api'

const REFUND_HOURS = [24, 72, 168]
const NO_REFUND = 'none'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const LINKS = {
    instagram: { field: 'public_instagram_url', pattern: /^https:\/\/(www\.)?instagram\.com\/\S+$/, example: 'https://instagram.com/name' },
    telegram: { field: 'public_telegram_url', pattern: /^https:\/\/t\.me\/\S+$/, example: 'https://t.me/name' },
    website: { field: 'public_website_url', pattern: /^https:\/\/\S+$/, example: 'https://example.kz' },
} as const

type LinkKey = keyof typeof LINKS

interface DetailsForm {
    description: string
    contactName: string
    contactEmail: string
    contactPhone: string
    instagram: string
    telegram: string
    website: string
    capacity: string
    refund: string
    visibility: EventVisibility
}

const toRefundValue = (hours: number | null | undefined) => (typeof hours === 'number' ? String(hours) : NO_REFUND)

const formFromEvent = (event: ManagedEvent): DetailsForm => ({
    description: event.description,
    contactName: event.public_contact_name ?? '',
    contactEmail: event.public_contact_email ?? '',
    contactPhone: (event.public_contact_phone ?? '').replace(/\D/g, ''),
    instagram: event.public_instagram_url ?? '',
    telegram: event.public_telegram_url ?? '',
    website: event.public_website_url ?? '',
    capacity: event.ga_capacity ? String(event.ga_capacity) : '',
    refund: toRefundValue(event.refund_policy.self_service_refund_until_hours_before_start),
    visibility: event.visibility,
})

const VISIBILITIES: EventVisibility[] = ['PUBLIC', 'UNLISTED', 'PRIVATE']

const orNull = (value: string) => value.trim() || null

interface EventDetailsFormProps {
    event: ManagedEvent
    onSaved: (event: ManagedEvent) => void
    onCancel: () => void
}

const EventDetailsForm = ({ event, onSaved, onCancel }: EventDetailsFormProps) => {
    const { t } = useLanguage()
    const texts = t.organizerEvent.form
    const initial = formFromEvent(event)
    const [form, setForm] = useState(initial)
    const [showErrors, setShowErrors] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState('')

    const canEditCapacity = event.status === 'DRAFT' && event.seating_mode === 'GENERAL_ADMISSION'

    const update = <K extends keyof DetailsForm>(key: K, value: DetailsForm[K]) => setForm((current) => ({ ...current, [key]: value }))

    const errors: Partial<Record<keyof DetailsForm, string>> = {}
    if (!form.description.trim()) errors.description = texts.required
    if (form.contactEmail.trim() && !EMAIL_PATTERN.test(form.contactEmail.trim())) errors.contactEmail = texts.invalidEmail
    if (form.contactPhone && validateKzMobilePhone(form.contactPhone) !== true) errors.contactPhone = texts.invalidPhone
    for (const key of Object.keys(LINKS) as LinkKey[]) {
        const value = form[key].trim()
        if (value && !LINKS[key].pattern.test(value)) errors[key] = texts.invalidUrl(LINKS[key].example)
    }
    if (canEditCapacity && form.capacity && !/^[1-9]\d*$/.test(form.capacity)) errors.capacity = texts.invalidCapacity

    const errorFor = (key: keyof DetailsForm) => (showErrors ? errors[key] : undefined)

    const buildUpdate = (): EventUpdate => {
        const input: EventUpdate = {
            description: form.description.trim(),
            public_contact_name: orNull(form.contactName),
            public_contact_email: orNull(form.contactEmail),
            public_contact_phone: form.contactPhone ? `+${form.contactPhone}` : null,
        }
        for (const key of Object.keys(LINKS) as LinkKey[]) {
            input[LINKS[key].field] = orNull(form[key])
        }
        if (canEditCapacity && form.capacity !== initial.capacity) {
            input.ga_capacity = form.capacity ? Number(form.capacity) : null
        }
        if (form.visibility !== initial.visibility) input.visibility = form.visibility
        if (form.refund !== initial.refund) {
            input.refund_policy = { self_service_refund_until_hours_before_start: form.refund === NO_REFUND ? null : Number(form.refund) }
        }
        return input
    }

    const handleSubmit = async (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        if (Object.keys(errors).length > 0) {
            setShowErrors(true)
            return
        }
        setIsSaving(true)
        setError('')
        try {
            onSaved(await updateEvent(event.id, buildUpdate()))
        } catch {
            setError(texts.saveFailed)
        }
        setIsSaving(false)
    }

    const refundOptions = [
        { value: NO_REFUND, label: t.organizerEvent.refundNone },
        ...[...new Set([...REFUND_HOURS, ...(initial.refund === NO_REFUND ? [] : [Number(initial.refund)])])]
            .sort((a, b) => a - b)
            .map((hours) => ({ value: String(hours), label: t.organizerEvent.refundUntil(hours) })),
    ]

    return (
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
            <h2 className="text-lg font-bold text-foreground">{texts.title}</h2>

            <FormField label={texts.description} htmlFor="event-description" error={errorFor('description')}>
                <Textarea
                    id="event-description"
                    value={form.description}
                    maxLength={20000}
                    hasError={Boolean(errorFor('description'))}
                    onChange={(changeEvent) => update('description', changeEvent.target.value)}
                />
            </FormField>

            <div className="grid gap-5 sm:grid-cols-2">
                <FormField label={texts.contactName} htmlFor="event-contact-name">
                    <Input
                        id="event-contact-name"
                        value={form.contactName}
                        maxLength={200}
                        onChange={(changeEvent) => update('contactName', changeEvent.target.value)}
                    />
                </FormField>
                <FormField label={texts.contactEmail} htmlFor="event-contact-email" error={errorFor('contactEmail')}>
                    <Input
                        id="event-contact-email"
                        type="email"
                        value={form.contactEmail}
                        hasError={Boolean(errorFor('contactEmail'))}
                        onChange={(changeEvent) => update('contactEmail', changeEvent.target.value)}
                    />
                </FormField>
                <FormField label={texts.contactPhone} htmlFor="event-contact-phone" error={errorFor('contactPhone')}>
                    <PhoneInput
                        id="event-contact-phone"
                        name="event-contact-phone"
                        value={form.contactPhone}
                        hasError={Boolean(errorFor('contactPhone'))}
                        onChange={(value) => {
                            if (value !== form.contactPhone) update('contactPhone', value)
                        }}
                        onBlur={() => undefined}
                        inputRef={() => undefined}
                    />
                </FormField>
                {(Object.keys(LINKS) as LinkKey[]).map((key) => (
                    <FormField key={key} label={texts[key]} htmlFor={`event-${key}`} error={errorFor(key)}>
                        <Input
                            id={`event-${key}`}
                            type="url"
                            value={form[key]}
                            maxLength={300}
                            placeholder={LINKS[key].example}
                            hasError={Boolean(errorFor(key))}
                            onChange={(changeEvent) => update(key, changeEvent.target.value)}
                        />
                    </FormField>
                ))}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
                {canEditCapacity && (
                    <FormField label={texts.capacity} htmlFor="event-capacity" error={errorFor('capacity')} hint={texts.capacityHint}>
                        <Input
                            id="event-capacity"
                            inputMode="numeric"
                            value={form.capacity}
                            hasError={Boolean(errorFor('capacity'))}
                            onChange={(changeEvent) => update('capacity', changeEvent.target.value.replace(/\D/g, ''))}
                        />
                    </FormField>
                )}
                <div>
                    <p className="text-sm font-medium text-foreground">{texts.visibility}</p>
                    <div className="mt-2">
                        <Select
                            value={form.visibility}
                            ariaLabel={texts.visibility}
                            fullWidth
                            options={VISIBILITIES.map((value) => ({ value, label: t.organizerEvent.visibility[value] }))}
                            onValueChange={(value) => update('visibility', value as EventVisibility)}
                        />
                    </div>
                    <p className="mt-2 text-sm text-muted">{texts.visibilityHint}</p>
                </div>
                <div>
                    <p className="text-sm font-medium text-foreground">{texts.refundPolicy}</p>
                    <div className="mt-2">
                        <Select
                            value={form.refund}
                            ariaLabel={texts.refundPolicy}
                            fullWidth
                            options={refundOptions}
                            onValueChange={(value) => update('refund', value)}
                        />
                    </div>
                    <p className="mt-2 text-sm text-muted">{texts.refundHint}</p>
                </div>
            </div>

            {error && (
                <p role="alert" className="text-sm text-error">
                    {error}
                </p>
            )}

            <div className="flex flex-wrap gap-3">
                <Button type="submit" shape="pill" disabled={isSaving}>
                    {isSaving ? texts.saving : texts.save}
                </Button>
                <Button type="button" variant="secondary" shape="pill" disabled={isSaving} onClick={onCancel}>
                    {texts.cancel}
                </Button>
            </div>
        </form>
    )
}

export default EventDetailsForm
