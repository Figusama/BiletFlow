import { useState, type FormEvent } from 'react'
import Button from '../../../components/ui/Button'
import FormField from '../../../components/ui/FormField'
import Input from '../../../components/ui/Input'
import { ApiError } from '../../../shared/api/client'
import { useLanguage } from '../../../shared/i18n/language'
import { fromDateTimeInput, toDateTimeInput } from '../../../shared/lib/date'
import ChoiceCards from '../../applications/components/ChoiceCards'
import {
    createTicketType,
    deleteTicketType,
    updateTicketType,
    type ManagedEvent,
    type ManagedTicketType,
    type TicketKind,
    type TicketTypeInput,
} from '../api'

interface TicketTypeFormState {
    name: string
    description: string
    kind: TicketKind
    price: string
    salesStart: string
    salesEnd: string
    maxPerOrder: string
    quantity: string
    isActive: boolean
}

const WHOLE_NUMBER = /^[1-9]\d*$/

const formFromType = (event: ManagedEvent, type: ManagedTicketType | null): TicketTypeFormState => ({
    name: type?.name ?? '',
    description: type?.description ?? '',
    kind: type?.kind ?? 'FREE',
    price: type && type.kind === 'PAID' ? String(type.price_minor / 100) : '',
    salesStart: toDateTimeInput(type?.sales_start_at ?? new Date().toISOString(), event.timezone),
    salesEnd: toDateTimeInput(type?.sales_end_at ?? event.ends_at, event.timezone),
    maxPerOrder: String(type?.max_per_order ?? 10),
    quantity: type?.quantity_total ? String(type.quantity_total) : '',
    isActive: type?.is_active ?? true,
})

interface TicketTypeFormProps {
    event: ManagedEvent
    ticketType: ManagedTicketType | null
    onDone: () => void
}

const TicketTypeForm = ({ event, ticketType, onDone }: TicketTypeFormProps) => {
    const { t } = useLanguage()
    const texts = t.organizerTickets.form
    const [form, setForm] = useState(() => formFromType(event, ticketType))
    const [showErrors, setShowErrors] = useState(false)
    const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
    const [error, setError] = useState('')

    const isGeneralAdmission = event.seating_mode === 'GENERAL_ADMISSION'
    const update = <K extends keyof TicketTypeFormState>(key: K, value: TicketTypeFormState[K]) =>
        setForm((current) => ({ ...current, [key]: value }))

    const salesStartAt = fromDateTimeInput(form.salesStart, event.timezone)
    const salesEndAt = fromDateTimeInput(form.salesEnd, event.timezone)

    const errors: Partial<Record<keyof TicketTypeFormState, string>> = {}
    if (!form.name.trim()) errors.name = texts.required
    if (form.kind === 'PAID' && !WHOLE_NUMBER.test(form.price)) errors.price = texts.invalidPrice
    if (!salesStartAt) errors.salesStart = texts.required
    if (!salesEndAt) errors.salesEnd = texts.required
    else if (salesStartAt && salesEndAt <= salesStartAt) errors.salesEnd = texts.endBeforeStart
    else if (new Date(salesEndAt) > new Date(event.ends_at)) errors.salesEnd = texts.endAfterEvent
    if (!WHOLE_NUMBER.test(form.maxPerOrder)) errors.maxPerOrder = texts.invalidNumber
    if (isGeneralAdmission && form.quantity && !WHOLE_NUMBER.test(form.quantity)) errors.quantity = texts.invalidNumber

    const errorFor = (key: keyof TicketTypeFormState) => (showErrors ? errors[key] : undefined)

    const buildInput = (): TicketTypeInput => ({
        name: form.name.trim(),
        description: form.description.trim() || null,
        kind: form.kind,
        price_minor: form.kind === 'PAID' ? Number(form.price) * 100 : 0,
        quantity_total: isGeneralAdmission && form.quantity ? Number(form.quantity) : null,
        sales_start_at: salesStartAt ?? '',
        sales_end_at: salesEndAt ?? '',
        max_per_order: Number(form.maxPerOrder),
        ...(ticketType ? { is_active: form.isActive } : {}),
    })

    const handleSubmit = async (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        if (Object.keys(errors).length > 0) {
            setShowErrors(true)
            return
        }
        setBusy('save')
        setError('')
        try {
            if (ticketType) {
                await updateTicketType(event.id, ticketType.id, buildInput())
            } else {
                await createTicketType(event.id, buildInput())
            }
            onDone()
        } catch {
            setError(texts.saveFailed)
            setBusy(null)
        }
    }

    const handleDelete = async () => {
        if (!ticketType) return
        setBusy('delete')
        setError('')
        try {
            await deleteTicketType(event.id, ticketType.id)
            onDone()
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 409 ? texts.inUse : texts.deleteFailed)
            setBusy(null)
        }
    }

    return (
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
            <h2 className="text-lg font-bold text-foreground">{ticketType ? texts.editTitle(ticketType.name) : texts.createTitle}</h2>

            <ChoiceCards
                name="ticket-kind"
                label={texts.kind}
                value={form.kind}
                choices={[
                    { value: 'FREE', label: t.organizerTickets.kinds.FREE, description: t.organizerTickets.freeText },
                    { value: 'PAID', label: t.organizerTickets.kinds.PAID, description: t.organizerTickets.paidText },
                ]}
                onChange={(kind) => update('kind', kind)}
            />

            <div className="grid gap-5 sm:grid-cols-2">
                <FormField label={texts.name} htmlFor="ticket-name" error={errorFor('name')}>
                    <Input
                        id="ticket-name"
                        value={form.name}
                        maxLength={200}
                        hasError={Boolean(errorFor('name'))}
                        onChange={(changeEvent) => update('name', changeEvent.target.value)}
                    />
                </FormField>
                {form.kind === 'PAID' && (
                    <FormField label={texts.price} htmlFor="ticket-price" error={errorFor('price')}>
                        <Input
                            id="ticket-price"
                            inputMode="numeric"
                            value={form.price}
                            hasError={Boolean(errorFor('price'))}
                            onChange={(changeEvent) => update('price', changeEvent.target.value.replace(/\D/g, ''))}
                        />
                    </FormField>
                )}
            </div>

            <FormField label={texts.description} htmlFor="ticket-description">
                <Input
                    id="ticket-description"
                    value={form.description}
                    maxLength={500}
                    onChange={(changeEvent) => update('description', changeEvent.target.value)}
                />
            </FormField>

            <div className="grid gap-5 sm:grid-cols-3">
                <FormField label={texts.salesStart} htmlFor="ticket-sales-start" error={errorFor('salesStart')}>
                    <Input
                        id="ticket-sales-start"
                        type="datetime-local"
                        value={form.salesStart}
                        hasError={Boolean(errorFor('salesStart'))}
                        onChange={(changeEvent) => update('salesStart', changeEvent.target.value)}
                    />
                </FormField>
                <FormField label={texts.salesEnd} htmlFor="ticket-sales-end" error={errorFor('salesEnd')}>
                    <Input
                        id="ticket-sales-end"
                        type="datetime-local"
                        value={form.salesEnd}
                        hasError={Boolean(errorFor('salesEnd'))}
                        onChange={(changeEvent) => update('salesEnd', changeEvent.target.value)}
                    />
                </FormField>
                <FormField label={texts.maxPerOrder} htmlFor="ticket-max" error={errorFor('maxPerOrder')}>
                    <Input
                        id="ticket-max"
                        inputMode="numeric"
                        value={form.maxPerOrder}
                        hasError={Boolean(errorFor('maxPerOrder'))}
                        onChange={(changeEvent) => update('maxPerOrder', changeEvent.target.value.replace(/\D/g, ''))}
                    />
                </FormField>
            </div>

            {isGeneralAdmission ? (
                <FormField label={texts.quantity} htmlFor="ticket-quantity" error={errorFor('quantity')} hint={texts.quantityHint}>
                    <Input
                        id="ticket-quantity"
                        inputMode="numeric"
                        value={form.quantity}
                        hasError={Boolean(errorFor('quantity'))}
                        onChange={(changeEvent) => update('quantity', changeEvent.target.value.replace(/\D/g, ''))}
                    />
                </FormField>
            ) : (
                <div>
                    <p className="text-sm font-medium text-foreground">{texts.quantity}</p>
                    <p className="mt-2 rounded-[14px] bg-surface-sunk px-4 py-3 text-sm text-muted">{texts.quantityBySeats}</p>
                </div>
            )}

            {ticketType && (
                <label className="flex cursor-pointer items-start gap-3">
                    <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(changeEvent) => update('isActive', changeEvent.target.checked)}
                        className="mt-0.5 size-5 shrink-0 accent-accent"
                    />
                    <span className="text-sm text-foreground">
                        {texts.active}
                        <span className="block text-muted">{texts.activeHint}</span>
                    </span>
                </label>
            )}

            {error && (
                <p role="alert" className="text-sm text-error">
                    {error}
                </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" shape="pill" disabled={busy !== null}>
                    {busy === 'save' ? texts.saving : ticketType ? texts.save : texts.create}
                </Button>
                <Button type="button" variant="secondary" shape="pill" disabled={busy !== null} onClick={onDone}>
                    {texts.cancel}
                </Button>
                {ticketType && (
                    <button
                        type="button"
                        disabled={busy !== null}
                        onClick={handleDelete}
                        className="ml-auto text-sm font-semibold text-danger hover:underline disabled:opacity-40"
                    >
                        {busy === 'delete' ? texts.deleting : texts.delete}
                    </button>
                )}
            </div>
        </form>
    )
}

export default TicketTypeForm
