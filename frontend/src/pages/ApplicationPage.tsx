import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { RootState } from '../app/store'
import Button from '../components/ui/Button'
import FormField from '../components/ui/FormField'
import Input from '../components/ui/Input'
import PhoneInput from '../components/ui/PhoneInput'
import Select from '../components/ui/Select'
import StatusBadge from '../components/ui/StatusBadge'
import Textarea from '../components/ui/Textarea'
import {
    acceptAgreements,
    createApplication,
    deleteApplicationImage,
    reorderApplicationImages,
    submitApplication,
    updateApplication,
    uploadApplicationImage,
    useApplication,
    useCategories,
    useCurrentAgreements,
    useVenues,
    withdrawApplication,
    type AgreementType,
    type Application,
    type SeatingMode,
    type Visibility,
} from '../features/applications/api'
import CategoryPicker from '../features/applications/components/CategoryPicker'
import ChoiceCards from '../features/applications/components/ChoiceCards'
import FormSection from '../features/applications/components/FormSection'
import ImageUploader from '../features/applications/components/ImageUploader'
import StatusPanel from '../features/applications/components/StatusPanel'
import SubmitChecklist from '../features/applications/components/SubmitChecklist'
import {
    emptyForm,
    formFromApplication,
    formToInput,
    getMissingFields,
    hasInvalidDates,
    TIME_ZONES,
    type ApplicationForm,
} from '../features/applications/form'
import { applicationBadge } from '../features/applications/status'
import { useLanguage } from '../shared/i18n/language'

const pageClass = 'mx-auto max-w-[1176px] px-4 pt-8 pb-16 sm:px-6'

type BusyAction = 'save' | 'submit' | 'upload' | 'withdraw' | null

const FieldError = ({ message }: { message?: string }) =>
    message ? <p className="mt-2 text-sm text-error">{message}</p> : null

const ApplicationEditor = ({ application }: { application?: Application }) => {
    const { t } = useLanguage()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const user = useSelector((state: RootState) => state.auth.user)
    const { data: categories = [] } = useCategories()
    const { data: venues = [] } = useVenues()
    const { data: currentAgreements = [] } = useCurrentAgreements()

    const acceptedAgreements = (application?.agreements ?? [])
        .filter((agreement) => agreement.is_current)
        .map((agreement) => agreement.document_type)

    const [form, setForm] = useState(() => (application ? formFromApplication(application, user) : emptyForm(user)))
    const [checkedAgreements, setCheckedAgreements] = useState<AgreementType[]>(acceptedAgreements)
    const [isDirty, setIsDirty] = useState(false)
    const [busy, setBusy] = useState<BusyAction>(null)
    const [error, setError] = useState('')
    const [imageError, setImageError] = useState('')
    const [showErrors, setShowErrors] = useState(false)
    const createdId = useRef<string | null>(null)

    const isDraft = !application || application.status === 'DRAFT'
    const datesInvalid = hasInvalidDates(form)
    const venue = venues.find((item) => item.id === form.venueId)
    const layouts = venue?.layouts.filter((layout) => layout.is_active) ?? []
    const images = [...(application?.images ?? [])].sort((a, b) => a.position - b.position)
    const missing = getMissingFields({
        form,
        venue,
        imageCount: images.length,
        checkedAgreements,
        requiredAgreements: currentAgreements.map((agreement) => agreement.document_type),
    })
    const isInvalid = (code: string) => showErrors && missing.includes(code)
    const errorFor = (code: string, message: string) => (isInvalid(code) ? message : undefined)
    const startError = errorFor('dates', t.application.required) ?? errorFor('start_in_future', t.application.startInPast)
    const badge = applicationBadge[application?.status ?? 'DRAFT']

    const markChanged = () => {
        setIsDirty(true)
        setError('')
    }

    const update = <K extends keyof ApplicationForm>(key: K, value: ApplicationForm[K]) => {
        setForm((current) => ({ ...current, [key]: value }))
        markChanged()
    }

    const changeVenue = (venueId: string) => {
        const nextVenue = venues.find((item) => item.id === venueId)
        const activeLayouts = nextVenue?.layouts.filter((layout) => layout.is_active) ?? []
        setForm((current) => ({
            ...current,
            venueId,
            timezone: nextVenue?.timezone ?? current.timezone,
            layoutId: activeLayouts.length === 1 ? activeLayouts[0].id : '',
        }))
        markChanged()
    }

    const toggleAgreement = (documentType: AgreementType) => {
        setCheckedAgreements((current) =>
            current.includes(documentType) ? current.filter((item) => item !== documentType) : [...current, documentType],
        )
        markChanged()
    }

    const store = (saved: Application) => {
        queryClient.setQueryData(['applications', saved.id], saved)
        if (!application) navigate(`/organizer/applications/${saved.id}`, { replace: true })
    }

    const save = async (): Promise<Application | null> => {
        if (datesInvalid) {
            setError(t.application.endBeforeStart)
            return null
        }

        try {
            const input = formToInput(form)
            const existingId = application?.id ?? createdId.current
            let saved = existingId ? await updateApplication(existingId, input) : await createApplication(input)
            createdId.current = saved.id
            const id = saved.id
            const toAccept = checkedAgreements.filter((documentType) => !acceptedAgreements.includes(documentType))
            if (toAccept.length > 0) saved = await acceptAgreements(id, toAccept)
            store(saved)
            setIsDirty(false)
            return saved
        } catch {
            setError(t.application.saveFailed)
            return null
        }
    }

    const run = async (action: BusyAction, task: () => Promise<void>) => {
        setBusy(action)
        setError('')
        await task()
        setBusy(null)
    }

    const handleSave = () =>
        run('save', async () => {
            await save()
        })

    const handleSubmit = () =>
        run('submit', async () => {
            if (missing.length > 0) {
                setShowErrors(true)
                setError(t.application.incomplete)
                return
            }
            const saved = await save()
            if (!saved) return
            if (saved.missing_for_submit.length > 0) {
                setError(t.application.incomplete)
                return
            }
            try {
                store(await submitApplication(saved.id))
                window.scrollTo({ top: 0 })
            } catch {
                setError(t.application.incomplete)
            }
        })

    const handleUpload = (file: File) =>
        run('upload', async () => {
            setImageError('')
            const id = application?.id ?? (await save())?.id
            if (!id) return
            try {
                store(await uploadApplicationImage(id, file))
            } catch {
                setImageError(t.application.imageFailed)
            }
        })

    const handleRemoveImage = async (imageId: string) => {
        if (!application) return
        store(await deleteApplicationImage(application.id, imageId))
    }

    const handleMakeCover = async (imageId: string) => {
        if (!application) return
        const order = [imageId, ...images.filter((image) => image.id !== imageId).map((image) => image.id)]
        store(await reorderApplicationImages(application.id, order))
    }

    const handleWithdraw = () =>
        run('withdraw', async () => {
            if (!application) return
            try {
                store(await withdrawApplication(application.id))
            } catch {
                setError(t.application.withdrawFailed)
            }
        })

    const agreementLabel = (documentType: AgreementType, version: string) =>
        documentType === 'ORGANIZER_RULES' ? t.application.organizerRules(version) : t.application.salesTerms(version)

    return (
        <div className={pageClass}>
            <p className="flex gap-2 text-xs font-bold tracking-widest text-muted uppercase">
                <Link to="/organizer/events" className="hover:text-accent">
                    {t.application.breadcrumb}
                </Link>
                {application && <span>{application.application_number}</span>}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{t.application.title}</h1>
                <StatusBadge tone={badge.tone} icon={badge.icon}>
                    {t.application.status[application?.status ?? 'DRAFT']}
                </StatusBadge>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted">{t.application.intro}</p>

            {application && !isDraft && (
                <StatusPanel application={application} isWithdrawing={busy === 'withdraw'} error={error} onWithdraw={handleWithdraw} />
            )}

            <div className={`mt-8 grid gap-8 lg:items-start ${isDraft ? 'lg:grid-cols-[minmax(0,1fr)_300px]' : 'max-w-3xl'}`}>
                <fieldset disabled={!isDraft} className="flex min-w-0 flex-col gap-6">
                    <FormSection number={1} title={t.application.about}>
                        <FormField label={t.application.titleLabel} htmlFor="title" error={errorFor('title', t.application.required)}>
                            <Input
                                id="title"
                                value={form.title}
                                maxLength={200}
                                hasError={isInvalid('title')}
                                onChange={(event) => update('title', event.target.value)}
                            />
                        </FormField>
                        <FormField label={t.application.description} htmlFor="description" error={errorFor('description', t.application.required)}>
                            <Textarea
                                id="description"
                                value={form.description}
                                maxLength={20000}
                                hasError={isInvalid('description')}
                                onChange={(event) => update('description', event.target.value)}
                            />
                        </FormField>
                        <div>
                            <p className="mb-2 text-sm font-medium text-foreground">{t.application.categories}</p>
                            <CategoryPicker
                                categories={categories}
                                selectedIds={form.categoryIds}
                                onChange={(ids) => update('categoryIds', ids)}
                            />
                            <FieldError message={errorFor('categories', t.application.chooseCategory)} />
                        </div>
                        <div>
                            <p className="mb-2 text-sm font-medium text-foreground">
                                {t.application.images}
                                <span className="ml-2 font-normal text-muted">{t.application.imagesHint}</span>
                            </p>
                            <ImageUploader
                                images={images}
                                isEditable={isDraft}
                                isUploading={busy === 'upload'}
                                error={imageError || errorFor('images', t.application.addImage) || ''}
                                onUpload={handleUpload}
                                onRemove={handleRemoveImage}
                                onMakeCover={handleMakeCover}
                            />
                        </div>
                    </FormSection>

                    <FormSection number={2} title={t.application.whereWhen}>
                        <div>
                            <p className="mb-2 text-sm font-medium text-foreground">{t.application.venue}</p>
                            <Select
                                value={form.venueId}
                                placeholder={t.application.chooseVenue}
                                ariaLabel={t.application.venue}
                                fullWidth
                                options={venues.map((item) => ({
                                    value: item.id,
                                    label: t.application.venueOption(item.name, item.city, item.max_capacity),
                                }))}
                                onValueChange={changeVenue}
                            />
                            <FieldError message={errorFor('venue', t.application.required)} />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <FormField label={t.application.startsAt} htmlFor="starts-at" error={startError}>
                                <Input
                                    id="starts-at"
                                    type="datetime-local"
                                    value={form.startsAt}
                                    hasError={Boolean(startError)}
                                    onChange={(event) => update('startsAt', event.target.value)}
                                />
                            </FormField>
                            <FormField
                                label={t.application.endsAt}
                                htmlFor="ends-at"
                                error={datesInvalid ? t.application.endBeforeStart : undefined}
                            >
                                <Input
                                    id="ends-at"
                                    type="datetime-local"
                                    value={form.endsAt}
                                    hasError={datesInvalid}
                                    onChange={(event) => update('endsAt', event.target.value)}
                                />
                            </FormField>
                            <div>
                                <p className="mb-2 text-sm font-medium text-foreground">{t.application.timezone}</p>
                                <Select
                                    value={form.timezone}
                                    ariaLabel={t.application.timezone}
                                    fullWidth
                                    options={[...new Set([form.timezone, ...TIME_ZONES])].map((zone) => ({ value: zone, label: zone }))}
                                    onValueChange={(zone) => update('timezone', zone)}
                                />
                            </div>
                        </div>
                    </FormSection>

                    <FormSection number={3} title={t.application.format}>
                        <ChoiceCards<SeatingMode>
                            name="seating"
                            label={t.application.seating}
                            hint={t.application.seatingHint}
                            value={form.seatingMode}
                            onChange={(value) => update('seatingMode', value)}
                            choices={[
                                {
                                    value: 'GENERAL_ADMISSION',
                                    label: t.application.generalAdmission,
                                    description: t.application.generalAdmissionText,
                                },
                                {
                                    value: 'ASSIGNED_SEATING',
                                    label: t.application.assignedSeating,
                                    description: t.application.assignedSeatingText,
                                },
                            ]}
                        />
                        {form.seatingMode === 'ASSIGNED_SEATING' && venue && (
                            <div>
                                <p className="mb-2 text-sm font-medium text-foreground">{t.application.layout}</p>
                                {layouts.length === 0 ? (
                                    <p className="text-sm text-muted">{t.application.noLayouts}</p>
                                ) : (
                                    <Select
                                        value={form.layoutId}
                                        placeholder={t.application.chooseLayout}
                                        ariaLabel={t.application.layout}
                                        fullWidth
                                        options={layouts.map((layout) => ({
                                            value: layout.id,
                                            label: t.application.layoutOption(layout.name, layout.seats),
                                        }))}
                                        onValueChange={(layoutId) => update('layoutId', layoutId)}
                                    />
                                )}
                                <FieldError message={errorFor('venue_layout', t.application.required)} />
                            </div>
                        )}
                        <ChoiceCards<Visibility>
                            name="visibility"
                            label={t.application.visibility}
                            value={form.visibility}
                            onChange={(value) => update('visibility', value)}
                            choices={[
                                { value: 'PUBLIC', label: t.application.public, description: t.application.publicText },
                                { value: 'UNLISTED', label: t.application.unlisted, description: t.application.unlistedText },
                                { value: 'PRIVATE', label: t.application.private, description: t.application.privateText },
                            ]}
                        />
                        <label className="flex items-start gap-3 text-sm text-foreground">
                            <input
                                type="checkbox"
                                checked={form.intendsPaidSales}
                                onChange={(event) => update('intendsPaidSales', event.target.checked)}
                                className="mt-0.5 size-4 shrink-0 accent-accent"
                            />
                            {t.application.paidSales}
                        </label>
                    </FormSection>

                    <FormSection number={4} title={t.application.responsible} hint={t.application.responsibleHint}>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <FormField
                                label={t.application.fullName}
                                htmlFor="responsible-name"
                                error={errorFor('responsible_name', t.application.required)}
                            >
                                <Input
                                    id="responsible-name"
                                    value={form.responsibleName}
                                    hasError={isInvalid('responsible_name')}
                                    maxLength={200}
                                    autoComplete="name"
                                    onChange={(event) => update('responsibleName', event.target.value)}
                                />
                            </FormField>
                            <FormField
                                label={t.application.email}
                                htmlFor="responsible-email"
                                error={errorFor('responsible_email', t.application.invalidEmail)}
                            >
                                <Input
                                    id="responsible-email"
                                    type="email"
                                    value={form.responsibleEmail}
                                    hasError={isInvalid('responsible_email')}
                                    autoComplete="email"
                                    onChange={(event) => update('responsibleEmail', event.target.value)}
                                />
                            </FormField>
                            <FormField
                                label={t.application.phone}
                                htmlFor="responsible-phone"
                                error={errorFor('responsible_phone', t.application.invalidPhone)}
                            >
                                <PhoneInput
                                    hasError={isInvalid('responsible_phone')}
                                    id="responsible-phone"
                                    name="responsible-phone"
                                    value={form.responsiblePhone}
                                    onChange={(value) => {
                                        if (value !== form.responsiblePhone) update('responsiblePhone', value)
                                    }}
                                    onBlur={() => undefined}
                                    inputRef={() => undefined}
                                />
                            </FormField>
                        </div>
                    </FormSection>

                    <FormSection number={5} title={t.application.agreements}>
                        {currentAgreements.map((agreement) => (
                            <label key={agreement.document_type} className="flex items-start gap-3 text-sm text-foreground">
                                <input
                                    type="checkbox"
                                    checked={checkedAgreements.includes(agreement.document_type)}
                                    disabled={acceptedAgreements.includes(agreement.document_type)}
                                    onChange={() => toggleAgreement(agreement.document_type)}
                                    className="mt-0.5 size-4 shrink-0 accent-accent"
                                />
                                {agreementLabel(agreement.document_type, agreement.document_version)}
                            </label>
                        ))}
                        <FieldError
                            message={
                                errorFor('agreement:ORGANIZER_RULES', t.application.acceptAgreements) ??
                                errorFor('agreement:TICKET_SALES_FINANCIAL_TERMS', t.application.acceptAgreements)
                            }
                        />
                    </FormSection>
                </fieldset>

                {isDraft && (
                    <aside className="rounded-2xl border border-border bg-surface p-5 lg:sticky lg:top-24">
                        <h2 className="text-base font-bold text-foreground">{t.application.checklistTitle}</h2>
                        <div className="mt-4">
                            <SubmitChecklist missing={missing} />
                        </div>

                        <Button fullWidth shape="pill" disabled={busy !== null} onClick={handleSubmit} className="mt-5 min-h-11">
                            {busy === 'submit' ? t.application.submitting : t.application.submit}
                        </Button>
                        <Button
                            variant="secondary"
                            fullWidth
                            shape="pill"
                            disabled={busy !== null}
                            onClick={handleSave}
                            className="mt-2 min-h-11"
                        >
                            {busy === 'save' ? t.application.saving : t.application.saveDraft}
                        </Button>

                        {error ? (
                            <p role="alert" className="mt-3 text-sm text-error">
                                {error}
                            </p>
                        ) : (
                            <p className="mt-3 text-center text-xs text-muted">
                                {isDirty ? t.application.unsaved : application ? t.application.saved : t.application.submitNote}
                            </p>
                        )}
                    </aside>
                )}
            </div>
        </div>
    )
}

const ApplicationPage = () => {
    const { t } = useLanguage()
    const { applicationId } = useParams()
    const { data: application, isPending, isError } = useApplication(applicationId)

    if (!applicationId) return <ApplicationEditor key="new" />

    if (isPending) return <div className={`${pageClass} h-96 animate-pulse`} />

    if (isError || !application) {
        return (
            <div className="mx-auto max-w-md px-4 py-16 text-center">
                <h1 className="text-2xl font-bold text-foreground">{t.application.notFound}</h1>
                <Link to="/" className="mt-6 inline-block font-semibold text-accent hover:underline">
                    {t.common.backToEvents}
                </Link>
            </div>
        )
    }

    return <ApplicationEditor key={application.id} application={application} />
}

export default ApplicationPage
