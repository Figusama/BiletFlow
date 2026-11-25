import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api/client'

export interface Notification {
    id: string
    type: string
    title: string
    body: string
    action_url: string | null
    read_at: string | null
    created_at: string
}

export const useUnreadCount = () =>
    useQuery({
        queryKey: ['notifications', 'unread'],
        queryFn: () => api<{ unread: number }>('/notifications/unread-count'),
        refetchInterval: 60_000,
        select: (data) => data.unread,
    })

export const useNotifications = (enabled: boolean) =>
    useQuery({
        queryKey: ['notifications', 'list'],
        queryFn: () => api<Notification[]>('/notifications?limit=20'),
        enabled,
    })

export const markNotificationRead = (id: string) => api<Notification>(`/notifications/${id}/read`, { method: 'POST' })

export const markAllNotificationsRead = () => api<{ unread: number }>('/notifications/read-all', { method: 'POST' })

export const toAppPath = (url: string) => {
    const { pathname, search, hash } = new URL(url, window.location.origin)
    return `${pathname}${search}${hash}`
}
