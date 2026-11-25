import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../../components/ui/Icon'
import { useLanguage } from '../../../shared/i18n/language'
import { formatRelativeTime } from '../../../shared/lib/relativeTime'
import { useDismiss } from '../../../shared/lib/useDismiss'
import {
    markAllNotificationsRead,
    markNotificationRead,
    toAppPath,
    useNotifications,
    useUnreadCount,
    type Notification,
} from '../api'

const NotificationsMenu = () => {
    const { t, language } = useLanguage()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const panelId = useId()
    const { data: unread = 0 } = useUnreadCount()
    const { data: notifications = [], isPending, isError } = useNotifications(isOpen)

    const close = useCallback(() => setIsOpen(false), [])
    useDismiss(containerRef, isOpen, close)

    const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] })

    const markLocally = (ids?: string[]) => {
        const readAt = new Date().toISOString()
        queryClient.setQueryData<Notification[]>(['notifications', 'list'], (list) =>
            list?.map((item) => (!ids || ids.includes(item.id) ? { ...item, read_at: item.read_at ?? readAt } : item)),
        )
        queryClient.setQueryData<{ unread: number }>(['notifications', 'unread'], (count) =>
            count && { unread: ids ? Math.max(0, count.unread - ids.length) : 0 },
        )
    }

    const handleOpen = (notification: Notification) => {
        if (!notification.read_at) {
            markLocally([notification.id])
            markNotificationRead(notification.id).catch(refresh)
        }
        if (notification.action_url) {
            setIsOpen(false)
            navigate(toAppPath(notification.action_url))
        }
    }

    const handleReadAll = () => {
        markLocally()
        markAllNotificationsRead().catch(refresh)
    }

    return (
        <div ref={containerRef} className="shrink-0 sm:relative">
            <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                aria-label={t.notifications.button(unread)}
                onClick={() => setIsOpen((open) => !open)}
                className="relative grid size-10 place-items-center rounded-full text-foreground hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
            >
                <Icon name="bell" className="size-5" />
                {unread > 0 && (
                    <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            <div
                id={panelId}
                hidden={!isOpen}
                className="fixed inset-x-4 top-20 z-20 rounded-2xl border border-border bg-surface shadow-lg sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-96"
            >
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <h2 className="text-sm font-bold text-foreground">{t.notifications.title}</h2>
                    {unread > 0 && (
                        <button type="button" onClick={handleReadAll} className="text-xs font-semibold text-accent hover:underline">
                            {t.notifications.markAllRead}
                        </button>
                    )}
                </div>

                {isPending ? (
                    <div className="m-3 h-24 animate-pulse rounded-xl bg-surface-sunk" />
                ) : isError ? (
                    <p className="px-4 py-8 text-center text-sm text-muted">{t.notifications.failed}</p>
                ) : notifications.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted">{t.notifications.empty}</p>
                ) : (
                    <ul className="max-h-[60vh] overflow-y-auto p-1.5">
                        {notifications.map((notification) => (
                            <li key={notification.id}>
                                <button
                                    type="button"
                                    onClick={() => handleOpen(notification)}
                                    className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent"
                                >
                                    <span
                                        aria-hidden="true"
                                        className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.read_at ? 'bg-transparent' : 'bg-accent'}`}
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className={`block text-sm text-foreground ${notification.read_at ? '' : 'font-semibold'}`}>
                                            {notification.title}
                                        </span>
                                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{notification.body}</span>
                                        <span className="mt-1 block text-xs text-muted">
                                            {formatRelativeTime(notification.created_at, language)}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}

export default NotificationsMenu
