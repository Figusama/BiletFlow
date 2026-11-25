import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import Button from '../components/ui/Button'
import FormField from '../components/ui/FormField'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import { createVenue } from '../features/admin/api'
import { useVenues, type Venue } from '../features/applications/api'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { APP_TIME_ZONE, isValidTimeZone } from '../shared/lib/date'

type SeatingFilter = 'ALL' | 'ASSIGNED' | 'GENERAL'

const seatingFilters: SeatingFilter[] = ['ALL', 'ASSIGNED', 'GENERAL']

const activeLayouts = (venue: Venue) => venue.layouts.filter((layout) => layout.is_active)

const numberFormat = new Intl.NumberFormat('ru-RU')

const emptyForm = { name: '', address: '', city: '', timezone: APP_TIME_ZONE, capacity: '' }

const AdminVenuesPage = () => {
    const { t } = useLanguage()
    const texts = t.admin.venues
    const queryClient = useQueryClient()
    const { data, isPending, isError } = useVenues()
    const [search, setSearch] = useState('')
    const [city, setCity] = useState('ALL')
    const [seating, setSeating] = useState<SeatingFilter>('ALL')
    const [isAdding, setIsAdding] = useState(false)
    const [form, setForm] = useState(emptyForm)
    const [errors, setErrors] = useState<Partial<Record<keyof typeof emptyForm, string>>>({})
    const [formError, setFormError] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    const venues = data ?? []
    const cities = [...new Set(venues.map((venue) => venue.city))].sort()
    const query = search.trim().toLowerCase()
    const visible = venues
        .filter((venue) => !query || [venue.name, venue.city].some((value) => value.toLowerCase().includes(query)))
        .filter((venue) => city === 'ALL' || venue.city === city)
        .filter((venue) => seating === 'ALL' || (seating === 'ASSIGNED') === (activeLayouts(venue).length > 0))

    const update = (key: keyof typeof emptyForm, value: string) => setForm((current) => ({ ...current, [key]: value }))

    const submit = async (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        const capacity = Number(form.capacity)
        const next: typeof errors = {}
        if (!form.name.trim()) next.name = texts.form.required
        if (!form.address.trim()) next.address = texts.form.required
        if (!form.city.trim()) next.city = texts.form.required
        if (!isValidTimeZone(form.timezone.trim())) next.timezone = texts.form.timezoneInvalid
        if (!Number.isInteger(capacity) || capacity <= 0) next.capacity = texts.form.capacityInvalid
        setErrors(next)
        setFormError('')
        if (Object.keys(next).length > 0) return
        setIsSaving(true)
        try {
            await createVenue({ name: form.name.trim(), address: form.address.trim(), city: form.city.trim(), timezone: form.timezone.trim(), max_capacity: capacity })
            await queryClient.invalidateQueries({ queryKey: ['venues'] })
            setForm(emptyForm)
            setIsAdding(false)
        } catch (caught) {
            setFormError(caught instanceof ApiError && caught.status === 422 ? texts.form.rejected : texts.form.failed)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{t.admin.groups.directory}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                    <p className="mt-1 max-w-xl text-sm text-muted">{texts.intro}</p>
                </div>
                {!isAdding && (
                    <Button shape="pill" onClick={() => setIsAdding(true)}>
                        {texts.add}
                    </Button>
                )}
            </header>

            {isAdding && (
                <form onSubmit={submit} noValidate className="rounded-2xl border border-border bg-surface p-6">
                    <h2 className="text-lg font-bold text-foreground">{texts.form.title}</h2>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <FormField label={texts.form.name} htmlFor="venue-name" error={errors.name}>
                            <Input id="venue-name" value={form.name} maxLength={200} hasError={Boolean(errors.name)} onChange={(changeEvent) => update('name', changeEvent.target.value)} />
                        </FormField>
                        <FormField label={texts.form.city} htmlFor="venue-city" error={errors.city}>
                            <Input id="venue-city" value={form.city} maxLength={100} hasError={Boolean(errors.city)} onChange={(changeEvent) => update('city', changeEvent.target.value)} />
                        </FormField>
                        <div className="sm:col-span-2">
                            <FormField label={texts.form.address} htmlFor="venue-address" error={errors.address}>
                                <Input id="venue-address" value={form.address} maxLength={500} hasError={Boolean(errors.address)} onChange={(changeEvent) => update('address', changeEvent.target.value)} />
                            </FormField>
                        </div>
                        <FormField label={texts.form.timezone} htmlFor="venue-timezone" error={errors.timezone} hint={texts.form.timezoneHint}>
                            <Input id="venue-timezone" value={form.timezone} maxLength={64} hasError={Boolean(errors.timezone)} onChange={(changeEvent) => update('timezone', changeEvent.target.value)} />
                        </FormField>
                        <FormField label={texts.form.capacity} htmlFor="venue-capacity" error={errors.capacity} hint={texts.form.capacityHint}>
                            <Input
                                id="venue-capacity"
                                inputMode="numeric"
                                value={form.capacity}
                                hasError={Boolean(errors.capacity)}
                                onChange={(changeEvent) => update('capacity', changeEvent.target.value.replace(/\D/g, ''))}
                            />
                        </FormField>
                    </div>
                    {formError && (
                        <p role="alert" className="mt-4 text-sm text-error">
                            {formError}
                        </p>
                    )}
                    <div className="mt-5 flex flex-wrap gap-3">
                        <Button type="submit" shape="pill" disabled={isSaving}>
                            {texts.form.save}
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            shape="pill"
                            disabled={isSaving}
                            onClick={() => {
                                setIsAdding(false)
                                setForm(emptyForm)
                                setErrors({})
                                setFormError('')
                            }}
                        >
                            {texts.form.cancel}
                        </Button>
                    </div>
                    <p className="mt-4 text-xs text-muted">{texts.form.layoutNote}</p>
                </form>
            )}

            <div className="flex flex-wrap items-center gap-3">
                <div className="w-full max-w-sm">
                    <label htmlFor="venue-search" className="sr-only">
                        {texts.searchPlaceholder}
                    </label>
                    <Input id="venue-search" type="search" value={search} placeholder={texts.searchPlaceholder} onChange={(changeEvent) => setSearch(changeEvent.target.value)} />
                </div>
                <Select
                    value={city}
                    ariaLabel={texts.cityFilter}
                    options={[{ value: 'ALL', label: texts.anyCity }, ...cities.map((value) => ({ value, label: value }))]}
                    onValueChange={setCity}
                />
                <Select
                    value={seating}
                    ariaLabel={texts.seatingFilter}
                    options={seatingFilters.map((value) => ({ value, label: texts.seatingOptions[value] }))}
                    onValueChange={setSeating}
                />
            </div>

            {isPending ? (
                <div className="h-48 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : visible.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty}</p>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <table className="w-full min-w-[640px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.columns.venue}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.seating}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.layout}</th>
                                <th className="px-5 py-3 text-right font-semibold">{texts.columns.capacity}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {visible.map((venue) => {
                                const layouts = activeLayouts(venue)
                                return (
                                    <tr key={venue.id} className="align-top">
                                        <td className="px-5 py-3">
                                            <p className="font-semibold text-foreground">{venue.name}</p>
                                            <p className="mt-0.5 text-xs text-muted">{venue.city}</p>
                                        </td>
                                        <td className="px-5 py-3 text-foreground">{layouts.length > 0 ? texts.seatingOptions.ASSIGNED : texts.seatingOptions.GENERAL}</td>
                                        <td className="px-5 py-3 text-foreground">
                                            {layouts.length === 0
                                                ? '—'
                                                : layouts.map((layout) => (
                                                      <p key={layout.id}>
                                                          {layout.version ? `${layout.name} v${layout.version}` : layout.name}
                                                          <span className="text-muted">{`, ${texts.seats(layout.seats)}`}</span>
                                                      </p>
                                                  ))}
                                        </td>
                                        <td className="px-5 py-3 text-right text-foreground">{numberFormat.format(venue.max_capacity)}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

export default AdminVenuesPage
