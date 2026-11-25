import { useState } from 'react'
import Button from '../../../components/ui/Button'
import FormField from '../../../components/ui/FormField'
import Input from '../../../components/ui/Input'
import PhoneInput from '../../../components/ui/PhoneInput'
import Select from '../../../components/ui/Select'
import Textarea from '../../../components/ui/Textarea'
import { ApiError } from '../../../shared/api/client'
import { useLanguage } from '../../../shared/i18n/language'
import { fromDateTimeInput, toDateTimeInput } from '../../../shared/lib/date'
import { validateKzMobilePhone } from '../../../shared/lib/phone'
import { useVenues } from '../../applications/api'
import {
    createChangeRequest,
    submitChangeRequest,
    type ChangeField,
    type ChangeItem,
    type ManagedEvent,
    type ManagedTicketType,
} from '../api'
import { EVENT_FIELDS, REFUND_HOURS, TICKET_FIELDS, formatChangeValue, ticketTypeName } from '../changes'

const NO_REFUND = 'none'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface ChangeRequestFormProps {
    event: ManagedEvent
    ticketTypes: ManagedTicketType[]
    onDone: (saved: boolean, message?: string) => void
}

const ChangeRequestForm = ({ event, ticketTypes, onDone }: ChangeRequestFormProps) => {
    const { t } = useLanguage()
    const texts = t.organizerChanges
    const formTexts = texts.form
    const { data: venues = [] } = useVenues()
    const isGeneralAdmission = event.seating_mode === 'GENERAL_ADMISSION'

    const fields = [...EVENT_FIELDS, ...(ticketTypes.length > 0 ? TICKET_FIELDS : [])].filter(
        (field) => isGeneralAdmission || (field !== 'GA_CAPACITY' && field !== 'TICKET_TYPE_QUANTITY'),
    )

    const [field, setField] = useState<ChangeField>('TITLE')
    const [typeId, setTypeId] = useState(ticketTypes[0]?.id ?? '')
    const [value, setValue] = useState(event.title)
    const [secondValue, setSecondValue] = useState('')
    const [valueError, setValueError] = useState('')
    const [items, setItems] = useState<ChangeItem[]>([])
    const [comment, setComment] = useState('')
    const [busy, setBusy] = useState<'draft' | 'submit' | null>(null)
    const [error, setError] = useState('')

    const isTicketField = TICKET_FIELDS.includes(field)
    const typesForField = field === 'TICKET_TYPE_PRICE' ? ticketTypes.filter((type) => type.kind === 'PAID') : ticketTypes
    const chosenType = typesForField.find((type) => type.id === typeId) ?? typesForField[0]

    const defaultsFor = (nextField: ChangeField, type: ManagedTicketType | undefined): [string, string] => {
        if (nextField === 'STARTS_AT') return [toDateTimeInput(event.starts_at, event.timezone), '']
        if (nextField === 'ENDS_AT') return [toDateTimeInput(event.ends_at, event.timezone), '']
        if (nextField === 'TITLE') return [event.title, '']
        if (nextField === 'VENUE') return [event.venue_id, '']
        if (nextField === 'REFUND_POLICY') return [NO_REFUND, '']
        if (nextField === 'TICKET_TYPE_ACTIVE') return [type?.is_active ? 'false' : 'true', '']
        if (nextField === 'TICKET_TYPE_SALES_WINDOW' && type) {
            return [toDateTimeInput(type.sales_start_at, event.timezone), toDateTimeInput(type.sales_end_at, event.timezone)]
        }
        return ['', '']
    }

    const reset = (nextField: ChangeField, type: ManagedTicketType | undefined) => {
        const [first, second] = defaultsFor(nextField, type)
        setValue(first)
        setSecondValue(second)
        setValueError('')
    }

    const chooseField = (nextField: ChangeField) => {
        setField(nextField)
        const nextTypes = nextField === 'TICKET_TYPE_PRICE' ? ticketTypes.filter((type) => type.kind === 'PAID') : ticketTypes
        const nextType = nextTypes.find((type) => type.id === typeId) ?? nextTypes[0]
        if (nextType) setTypeId(nextType.id)
        reset(nextField, nextType)
    }

    const chooseType = (nextTypeId: string) => {
        setTypeId(nextTypeId)
        reset(field, ticketTypes.find((type) => type.id === nextTypeId))
    }

    const buildValue = (): { value?: unknown; error?: string } => {
        const trimmed = value.trim()
        switch (field) {
            case 'TITLE':
            case 'RESPONSIBLE_NAME':
                return trimmed ? { value: trimmed } : { error: formTexts.required }
            case 'RESPONSIBLE_EMAIL':
                return EMAIL_PATTERN.test(trimmed) ? { value: trimmed } : { error: formTexts.invalidEmail }
            case 'RESPONSIBLE_PHONE':
                return validateKzMobilePhone(value) === true ? { value: `+${value}` } : { error: formTexts.invalidPhone }
            case 'STARTS_AT':
            case 'ENDS_AT': {
                const iso = fromDateTimeInput(value, event.timezone)
                return iso ? { value: iso } : { error: formTexts.required }
            }
            case 'VENUE':
                return value ? { value } : { error: formTexts.required }
            case 'GA_CAPACITY':
            case 'TICKET_TYPE_PRICE':
                return /^[1-9]\d*$/.test(value) ? { value: field === 'TICKET_TYPE_PRICE' ? Number(value) * 100 : Number(value) } : { error: formTexts.invalidNumber }
            case 'TICKET_TYPE_QUANTITY':
                if (!value) return { value: null }
                return /^[1-9]\d*$/.test(value) ? { value: Number(value) } : { error: formTexts.invalidNumber }
            case 'TICKET_TYPE_ACTIVE':
                return { value: value === 'true' }
            case 'REFUND_POLICY':
                return { value: { self_service_refund_until_hours_before_start: value === NO_REFUND ? null : Number(value) } }
            case 'TICKET_TYPE_SALES_WINDOW': {
                const start = fromDateTimeInput(value, event.timezone)
                const end = fromDateTimeInput(secondValue, event.timezone)
                return start && end ? { value: { sales_start_at: start, sales_end_at: end } } : { error: formTexts.required }
            }
            default:
                return { error: formTexts.required }
        }
    }

    const addItem = () => {
        const targetId = isTicketField ? (chosenType?.id ?? null) : null
        if (items.some((item) => item.field === field && item.target_id === targetId)) {
            setValueError(formTexts.alreadyAdded)
            return
        }
        const built = buildValue()
        if (built.error) {
            setValueError(built.error)
            return
        }
        setItems((current) => [...current, { field, target_id: targetId, new_value: built.value }])
        reset(field, chosenType)
    }

    const save = async (andSubmit: boolean) => {
        if (items.length === 0) {
            setError(formTexts.noItems)
            return
        }
        setBusy(andSubmit ? 'submit' : 'draft')
        setError('')
        let created
        try {
            created = await createChangeRequest(event.id, items, comment.trim() || null)
        } catch {
            setError(formTexts.failed)
            setBusy(null)
            return
        }
        if (andSubmit) {
            try {
                await submitChangeRequest(created.id)
            } catch (caught) {
                onDone(true, caught instanceof ApiError && caught.status === 409 ? texts.oneAtATime : texts.actionFailed)
                return
            }
        }
        onDone(true)
    }

    const refundOptions = [
        { value: NO_REFUND, label: t.organizerEvent.refundNone },
        ...REFUND_HOURS.map((hours) => ({ value: String(hours), label: t.organizerEvent.refundUntil(hours) })),
    ]

    const valueInput = () => {
        const common = { id: 'change-value', hasError: Boolean(valueError) }
        switch (field) {
            case 'STARTS_AT':
            case 'ENDS_AT':
                return <Input {...common} type="datetime-local" value={value} onChange={(changeEvent) => setValue(changeEvent.target.value)} />
            case 'VENUE':
                return (
                    <Select
                        value={value}
                        ariaLabel={formTexts.newValue}
                        fullWidth
                        options={venues.map((venue) => ({ value: venue.id, label: `${venue.name}, ${venue.city}` }))}
                        onValueChange={setValue}
                    />
                )
            case 'REFUND_POLICY':
                return <Select value={value} ariaLabel={formTexts.newValue} fullWidth options={refundOptions} onValueChange={setValue} />
            case 'TICKET_TYPE_ACTIVE':
                return (
                    <Select
                        value={value}
                        ariaLabel={formTexts.newValue}
                        fullWidth
                        options={[
                            { value: 'true', label: texts.visible },
                            { value: 'false', label: texts.hidden },
                        ]}
                        onValueChange={setValue}
                    />
                )
            case 'RESPONSIBLE_PHONE':
                return (
                    <PhoneInput
                        id="change-value"
                        name="change-value"
                        value={value}
                        hasError={Boolean(valueError)}
                        onChange={(next) => {
                            if (next !== value) setValue(next)
                        }}
                        onBlur={() => undefined}
                        inputRef={() => undefined}
                    />
                )
            case 'TICKET_TYPE_SALES_WINDOW':
                return (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Input {...common} type="datetime-local" aria-label={t.organizerTickets.form.salesStart} value={value} onChange={(changeEvent) => setValue(changeEvent.target.value)} />
                        <Input
                            id="change-value-end"
                            hasError={Boolean(valueError)}
                            type="datetime-local"
                            aria-label={t.organizerTickets.form.salesEnd}
                            value={secondValue}
                            onChange={(changeEvent) => setSecondValue(changeEvent.target.value)}
                        />
                    </div>
                )
            case 'GA_CAPACITY':
            case 'TICKET_TYPE_PRICE':
            case 'TICKET_TYPE_QUANTITY':
                return <Input {...common} inputMode="numeric" value={value} onChange={(changeEvent) => setValue(changeEvent.target.value.replace(/\D/g, ''))} />
            default:
                return (
                    <Input
                        {...common}
                        type={field === 'RESPONSIBLE_EMAIL' ? 'email' : 'text'}
                        maxLength={200}
                        value={value}
                        onChange={(changeEvent) => setValue(changeEvent.target.value)}
                    />
                )
        }
    }

    const valueLabel = field === 'TICKET_TYPE_PRICE' ? `${formTexts.newValue}, ₸` : formTexts.newValue

    return (
        <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-bold text-foreground">{texts.new}</h2>

            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <p className="text-sm font-medium text-foreground">{formTexts.what}</p>
                    <div className="mt-2">
                        <Select
                            value={field}
                            ariaLabel={formTexts.what}
                            fullWidth
                            options={fields.map((option) => ({ value: option, label: texts.fields[option] }))}
                            onValueChange={chooseField}
                        />
                    </div>
                </div>
                {isTicketField && typesForField.length > 0 && (
                    <div>
                        <p className="text-sm font-medium text-foreground">{formTexts.ticketType}</p>
                        <div className="mt-2">
                            <Select
                                value={chosenType?.id ?? ''}
                                ariaLabel={formTexts.ticketType}
                                fullWidth
                                options={typesForField.map((type) => ({ value: type.id, label: type.name }))}
                                onValueChange={chooseType}
                            />
                        </div>
                    </div>
                )}
            </div>

            <FormField label={valueLabel} htmlFor="change-value" error={valueError}>
                {valueInput()}
            </FormField>

            <div>
                <Button type="button" variant="secondary" shape="pill" onClick={addItem}>
                    {formTexts.add}
                </Button>
            </div>

            {(field === 'STARTS_AT' || field === 'VENUE') && <p className="text-sm text-muted">{formTexts.refundNote}</p>}

            {items.length > 0 && (
                <div>
                    <p className="text-sm font-medium text-foreground">{formTexts.items}</p>
                    <ul className="mt-2 divide-y divide-border rounded-2xl border border-border">
                        {items.map((item, index) => (
                            <li key={`${item.field}-${item.target_id}`} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                                <div>
                                    <p className="font-semibold text-foreground">
                                        {texts.fields[item.field]}
                                        {item.target_id && <span className="font-normal text-muted"> {ticketTypeName(ticketTypes, item.target_id)}</span>}
                                    </p>
                                    <p className="mt-0.5 text-muted">{formatChangeValue(item.field, item.new_value, { t, event, venues })}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                                    className="shrink-0 font-semibold text-danger hover:underline"
                                >
                                    {formTexts.remove}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <FormField label={formTexts.comment} htmlFor="change-comment" hint={formTexts.commentHint}>
                <Textarea id="change-comment" value={comment} maxLength={2000} className="min-h-20" onChange={(changeEvent) => setComment(changeEvent.target.value)} />
            </FormField>

            {error && (
                <p role="alert" className="text-sm text-error">
                    {error}
                </p>
            )}

            <div className="flex flex-wrap gap-3">
                <Button type="button" shape="pill" disabled={busy !== null} onClick={() => save(true)}>
                    {busy === 'submit' ? formTexts.saving : formTexts.saveAndSubmit}
                </Button>
                <Button type="button" variant="secondary" shape="pill" disabled={busy !== null} onClick={() => save(false)}>
                    {busy === 'draft' ? formTexts.saving : formTexts.saveDraft}
                </Button>
                <Button type="button" variant="secondary" shape="pill" disabled={busy !== null} onClick={() => onDone(false)}>
                    {formTexts.cancel}
                </Button>
            </div>
        </section>
    )
}

export default ChangeRequestForm
