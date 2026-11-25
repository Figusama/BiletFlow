import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type { EventCategory } from '../events/api'

export type ApplicationStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
export type Visibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE'
export type SeatingMode = 'GENERAL_ADMISSION' | 'ASSIGNED_SEATING'
export type AgreementType = 'ORGANIZER_RULES' | 'TICKET_SALES_FINANCIAL_TERMS'

export interface ApplicationImage {
    id: string
    position: number
    url: string
}

export interface Application {
    id: string
    application_number: string
    status: ApplicationStatus
    title: string | null
    description: string | null
    venue_id: string | null
    venue_layout_id: string | null
    starts_at: string | null
    ends_at: string | null
    timezone: string | null
    visibility: Visibility | null
    seating_mode: SeatingMode | null
    responsible_name: string | null
    responsible_email: string | null
    responsible_phone: string | null
    intends_paid_sales: boolean
    categories: (EventCategory & { id: string })[]
    images: ApplicationImage[]
    agreements: { document_type: AgreementType; document_version: string; is_current: boolean }[]
    venue_name_snapshot: string | null
    review_comment: string | null
    event_id: string | null
    missing_for_submit: string[]
}

export interface ApplicationInput {
    title: string | null
    description: string | null
    venue_id: string | null
    venue_layout_id: string | null
    starts_at: string | null
    ends_at: string | null
    timezone: string | null
    visibility: Visibility | null
    seating_mode: SeatingMode | null
    responsible_name: string | null
    responsible_email: string | null
    responsible_phone: string | null
    intends_paid_sales: boolean
    category_ids: string[]
}

export interface Category {
    id: string
    name: string
    slug: string
}

export interface VenueLayout {
    id: string
    name: string
    is_active: boolean
    seats: number
}

export interface Venue {
    id: string
    name: string
    address: string
    city: string
    timezone: string
    max_capacity: number
    layouts: VenueLayout[]
}

export interface CurrentAgreement {
    document_type: AgreementType
    document_version: string
}

export const useApplication = (id: string | undefined) =>
    useQuery({
        queryKey: ['applications', id],
        queryFn: () => api<Application>(`/event-applications/${id}`),
        enabled: Boolean(id),
    })

export const useMyApplications = () =>
    useQuery({ queryKey: ['applications', 'mine'], queryFn: () => api<Application[]>('/event-applications/mine') })

export const useCategories = () =>
    useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories'), staleTime: Infinity })

export const useVenues = () => useQuery({ queryKey: ['venues'], queryFn: () => api<Venue[]>('/venues'), staleTime: Infinity })

export const useCurrentAgreements = () =>
    useQuery({
        queryKey: ['agreements'],
        queryFn: () => api<CurrentAgreement[]>('/event-applications/agreements/current'),
        staleTime: Infinity,
    })

export const createApplication = (input: ApplicationInput) =>
    api<Application>('/event-applications', { method: 'POST', json: input })

export const updateApplication = (id: string, input: ApplicationInput) =>
    api<Application>(`/event-applications/${id}`, { method: 'PATCH', json: input })

export const uploadApplicationImage = (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api<Application>(`/event-applications/${id}/images`, { method: 'POST', form })
}

export const deleteApplicationImage = (id: string, imageId: string) =>
    api<Application>(`/event-applications/${id}/images/${imageId}`, { method: 'DELETE' })

export const reorderApplicationImages = (id: string, imageIds: string[]) =>
    api<Application>(`/event-applications/${id}/images/order`, { method: 'PUT', json: imageIds })

export const acceptAgreements = (id: string, documents: AgreementType[]) =>
    api<Application>(`/event-applications/${id}/agreements`, { method: 'PUT', json: { documents } })

export const deleteApplication = (id: string) => api<void>(`/event-applications/${id}`, { method: 'DELETE' })

export const copyApplication = (id: string) => api<Application>(`/event-applications/${id}/copy`, { method: 'POST' })

export const submitApplication = (id: string) => api<Application>(`/event-applications/${id}/submit`, { method: 'POST' })

export const withdrawApplication = (id: string) => api<Application>(`/event-applications/${id}/withdraw`, { method: 'POST' })
