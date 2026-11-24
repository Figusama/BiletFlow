import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api/client'

export interface EventCategory {
    slug: string
    name: string
}

export interface EventPhoto {
    id: string
    position: number
    url: string
}

export interface EventSummary {
    id: string
    public_id: string
    slug: string
    title: string
    description: string
    venue_name: string | null
    venue_address: string | null
    venue_city: string | null
    starts_at: string
    ends_at: string
    timezone: string
    images?: EventPhoto[]
    cover_image_url?: string | null
    categories?: EventCategory[]
    price_from?: number | null
}

export interface EventDetails extends EventSummary {
    status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED'
    is_suspended: boolean
    seating_mode: 'GENERAL_ADMISSION' | 'ASSIGNED_SEATING'
    public_contact_name: string | null
    public_contact_email: string | null
    public_contact_phone: string | null
    calendar_ics_url: string | null
    google_calendar_url: string | null
}

export const getImageUrls = (event: EventSummary) =>
    [...(event.images ?? [])].sort((a, b) => a.position - b.position).map((image) => image.url)

export const getCoverUrl = (event: EventSummary) => event.cover_image_url ?? getImageUrls(event)[0]

export const useEvent = (ref: string) =>
    useQuery({
        queryKey: ['events', ref],
        queryFn: () => api<EventDetails>(`/events/${ref}`),
        enabled: Boolean(ref),
    })

export const useEvents = () =>
    useQuery({
        queryKey: ['events'],
        queryFn: () => api<EventSummary[]>('/events/'),
    })
