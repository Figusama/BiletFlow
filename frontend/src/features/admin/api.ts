import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type { Application, ApplicationStatus } from '../applications/api'

export type ReviewStatus = Exclude<ApplicationStatus, 'DRAFT'>

export const reviewStatuses: ReviewStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']

export interface AdminApplication extends Application {
    applicant_user_id: string
    venue_address_snapshot: string | null
    venue_city_snapshot: string | null
    submitted_at: string | null
    reviewed_at: string | null
    agreements: { document_type: 'ORGANIZER_RULES' | 'TICKET_SALES_FINANCIAL_TERMS'; document_version: string; accepted_at: string; is_current: boolean }[]
}

export const adminApplicationsKey = ['admin', 'applications']

export const useAdminApplications = (status: ReviewStatus, page: number, pageSize: number) =>
    useQuery({
        queryKey: [...adminApplicationsKey, 'list', status, page],
        queryFn: () => api<AdminApplication[]>(`/admin/event-applications?status=${status}&limit=${pageSize + 1}&offset=${page * pageSize}`),
        placeholderData: keepPreviousData,
    })

export const useAdminApplication = (applicationId: string | undefined) =>
    useQuery({
        queryKey: [...adminApplicationsKey, 'detail', applicationId],
        queryFn: () => api<AdminApplication>(`/event-applications/${applicationId}`),
        enabled: Boolean(applicationId),
    })

export const approveApplication = (applicationId: string) =>
    api<AdminApplication>(`/admin/event-applications/${applicationId}/approve`, {
        method: 'POST',
        json: { confirm_responsible_organizer: true },
    })

export const rejectApplication = (applicationId: string, reviewComment: string) =>
    api<AdminApplication>(`/admin/event-applications/${applicationId}/reject`, {
        method: 'POST',
        json: { review_comment: reviewComment },
    })

export const waitingTime = (submittedAt: string) => {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(submittedAt).getTime()) / 60_000))
    if (minutes >= 1440) return { value: Math.floor(minutes / 1440), unit: 'day' as const }
    if (minutes >= 60) return { value: Math.floor(minutes / 60), unit: 'hour' as const }
    return { value: minutes, unit: 'minute' as const }
}
