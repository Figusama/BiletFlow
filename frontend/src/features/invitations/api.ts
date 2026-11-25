import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api/client'

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
