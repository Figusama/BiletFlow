import { APP_TIME_ZONE, fromDateTimeInput, toDateTimeInput } from '../../shared/lib/date'
import type { AuthUser } from '../auth/authSlice'
import type { AgreementType, Application, ApplicationInput, SeatingMode, Venue, Visibility } from './api'

export interface ApplicationForm {
    title: string
    description: string
    categoryIds: string[]
    venueId: string
    layoutId: string
    startsAt: string
    endsAt: string
    timezone: string
    seatingMode: SeatingMode
    visibility: Visibility
    intendsPaidSales: boolean
    responsibleName: string
    responsibleEmail: string
    responsiblePhone: string
}

export const TIME_ZONES = ['Asia/Almaty', 'Asia/Aqtobe', 'Asia/Aqtau', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Qyzylorda']

export const emptyForm = (user: AuthUser | null): ApplicationForm => ({
    title: '',
    description: '',
    categoryIds: [],
    venueId: '',
    layoutId: '',
    startsAt: '',
    endsAt: '',
    timezone: APP_TIME_ZONE,
    seatingMode: 'GENERAL_ADMISSION',
    visibility: 'PUBLIC',
    intendsPaidSales: false,
    responsibleName: user?.fullName ?? '',
    responsibleEmail: user?.email ?? '',
    responsiblePhone: '',
})

export const formFromApplication = (application: Application, user: AuthUser | null): ApplicationForm => {
    const empty = emptyForm(user)
    const timezone = application.timezone ?? empty.timezone

    return {
        title: application.title ?? '',
        description: application.description ?? '',
        categoryIds: application.categories.map((category) => category.id),
        venueId: application.venue_id ?? '',
        layoutId: application.venue_layout_id ?? '',
        startsAt: toDateTimeInput(application.starts_at, timezone),
        endsAt: toDateTimeInput(application.ends_at, timezone),
        timezone,
        seatingMode: application.seating_mode ?? empty.seatingMode,
        visibility: application.visibility ?? empty.visibility,
        intendsPaidSales: application.intends_paid_sales,
        responsibleName: application.responsible_name ?? empty.responsibleName,
        responsibleEmail: application.responsible_email ?? empty.responsibleEmail,
        responsiblePhone: (application.responsible_phone ?? '').replace(/\D/g, ''),
    }
}

const textOrNull = (value: string) => value.trim() || null

export const formToInput = (form: ApplicationForm): ApplicationInput => ({
    title: textOrNull(form.title),
    description: textOrNull(form.description),
    venue_id: form.venueId || null,
    venue_layout_id: form.seatingMode === 'ASSIGNED_SEATING' ? form.layoutId || null : null,
    starts_at: fromDateTimeInput(form.startsAt, form.timezone),
    ends_at: fromDateTimeInput(form.endsAt, form.timezone),
    timezone: form.timezone,
    visibility: form.visibility,
    seating_mode: form.seatingMode,
    responsible_name: textOrNull(form.responsibleName),
    responsible_email: textOrNull(form.responsibleEmail),
    responsible_phone: form.responsiblePhone ? `+${form.responsiblePhone}` : null,
    intends_paid_sales: form.intendsPaidSales,
    category_ids: form.categoryIds,
})

export const hasInvalidDates = (form: ApplicationForm) => Boolean(form.startsAt && form.endsAt && form.endsAt <= form.startsAt)

export const CHECKLIST = [
    { key: 'about', codes: ['title', 'description'] },
    { key: 'categories', codes: ['categories'] },
    { key: 'images', codes: ['images'] },
    { key: 'venue', codes: ['venue'] },
    { key: 'dates', codes: ['dates', 'ends_after_start', 'start_in_future', 'timezone'] },
    { key: 'format', codes: ['seating_mode', 'visibility', 'venue_layout'] },
    { key: 'responsible', codes: ['responsible_name', 'responsible_email', 'responsible_phone'] },
    { key: 'agreements', codes: ['agreement:ORGANIZER_RULES', 'agreement:TICKET_SALES_FINANCIAL_TERMS'] },
] as const

export type ChecklistKey = (typeof CHECKLIST)[number]['key']

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface MissingContext {
    form: ApplicationForm
    venue: Venue | undefined
    imageCount: number
    checkedAgreements: AgreementType[]
    requiredAgreements: AgreementType[]
}

export const getMissingFields = ({ form, venue, imageCount, checkedAgreements, requiredAgreements }: MissingContext) => {
    const missing: string[] = []
    if (!form.title.trim()) missing.push('title')
    if (!form.description.trim()) missing.push('description')
    if (form.categoryIds.length === 0) missing.push('categories')
    if (imageCount === 0) missing.push('images')
    if (!venue) missing.push('venue')
    if (!form.startsAt || !form.endsAt) missing.push('dates')
    else if (hasInvalidDates(form)) missing.push('ends_after_start')
    else if (new Date(fromDateTimeInput(form.startsAt, form.timezone) ?? 0) <= new Date()) missing.push('start_in_future')
    if (form.seatingMode === 'ASSIGNED_SEATING' && !form.layoutId) missing.push('venue_layout')
    if (!form.responsibleName.trim()) missing.push('responsible_name')
    if (!EMAIL_PATTERN.test(form.responsibleEmail.trim())) missing.push('responsible_email')
    if (form.responsiblePhone.length !== 11) missing.push('responsible_phone')
    for (const documentType of requiredAgreements) {
        if (!checkedAgreements.includes(documentType)) missing.push(`agreement:${documentType}`)
    }
    return missing
}
