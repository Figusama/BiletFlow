import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type { StaffInvitationStatus, StaffRole } from '../organizer/api'

export interface MyStaffInvitation {
    id: string
    event_id: string
    event_title: string
    invited_role: StaffRole
    status: StaffInvitationStatus
    expires_at: string
    created_at: string
}

export const myStaffInvitationsKey = ['staff-invitations', 'mine']

export const useMyStaffInvitations = () =>
    useQuery({
        queryKey: myStaffInvitationsKey,
        queryFn: () => api<MyStaffInvitation[]>('/staff-invitations/mine'),
    })

export const acceptStaffInvitation = (invitationId: string) => api<MyStaffInvitation>(`/staff-invitations/${invitationId}/accept`, { method: 'POST' })

export const declineStaffInvitation = (invitationId: string) => api<MyStaffInvitation>(`/staff-invitations/${invitationId}/decline`, { method: 'POST' })

export interface PrivateInvitationTarget {
    event_id: string
    slug: string
    expires_at: string
}

export const usePrivateInvitation = (token: string | undefined, enabled: boolean) =>
    useQuery({
        queryKey: ['private-invitation', token],
        queryFn: () => api<PrivateInvitationTarget>(`/private-invitations/${encodeURIComponent(token ?? '')}`),
        enabled: enabled && Boolean(token),
        retry: false,
    })
