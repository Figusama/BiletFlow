import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import Icon from '../../../components/ui/Icon'
import StatusBadge from '../../../components/ui/StatusBadge'
import { useLanguage } from '../../../shared/i18n/language'
import { useManagedEvent, usePendingRefunds } from '../api'
import { eventBadge, suspendedBadge } from '../status'
import { matchesSupportTab, useEventSupportCases } from '../support'

const menuLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center rounded-xl px-3 py-2.5 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
        isActive ? 'bg-accent-soft font-semibold text-accent' : 'text-foreground hover:bg-surface-sunk'
    }`

const groupTitleClass = 'mb-1 px-3 text-xs font-bold tracking-widest text-muted uppercase'

const OrganizerEventLayout = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event } = useManagedEvent(eventId)
    const { data: pendingRefunds = [] } = usePendingRefunds(eventId)
    const { data: supportCases = [] } = useEventSupportCases(eventId)
    const queuedCases = supportCases.filter((supportCase) => matchesSupportTab(supportCase, 'UNASSIGNED', undefined))
    const badge = event?.is_suspended ? suspendedBadge : eventBadge[event?.status ?? 'DRAFT']

    return (
        <div className="mx-auto grid max-w-[1176px] gap-6 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[248px_minmax(0,1fr)] lg:items-start">
            <aside className="rounded-2xl border border-border bg-surface p-4 lg:sticky lg:top-24">
                <Link
                    to="/organizer/events"
                    className="flex items-center gap-2 px-2 text-sm font-medium text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                >
                    <Icon name="chevron-left" className="size-4" />
                    {t.organizerEvent.allEvents}
                </Link>

                {event && (
                    <div className="mt-4 flex items-center gap-3 px-2">
                        {event.cover_image_url && (
                            <img src={event.cover_image_url} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
                        )}
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">{event.title}</p>
                            <div className="mt-1">
                                <StatusBadge tone={badge.tone} icon={badge.icon}>
                                    {event.is_suspended ? t.organizerEvent.suspended : t.organizerEvent.status[event.status]}
                                </StatusBadge>
                            </div>
                        </div>
                    </div>
                )}

                <nav aria-label={t.organizerEvent.menu} className="mt-5 flex flex-col gap-4 border-t border-border pt-4">
                    <div>
                        <p className={groupTitleClass}>{t.organizerEvent.groups.event}</p>
                        <NavLink to={`/organizer/events/${eventId}`} end className={menuLinkClass}>
                            {t.organizerEvent.overview}
                        </NavLink>
                        <NavLink to={`/organizer/events/${eventId}/ticket-types`} className={menuLinkClass}>
                            {t.organizerTickets.title}
                        </NavLink>
                        {event?.seating_mode === 'ASSIGNED_SEATING' && (
                            <NavLink to={`/organizer/events/${eventId}/seating`} className={menuLinkClass}>
                                {t.organizerSeats.title}
                            </NavLink>
                        )}
                        <NavLink to={`/organizer/events/${eventId}/paid-sales`} className={menuLinkClass}>
                            {t.organizerPaidSales.title}
                        </NavLink>
                        <NavLink to={`/organizer/events/${eventId}/promo-codes`} className={menuLinkClass}>
                            {t.organizerPromo.title}
                        </NavLink>
                    </div>

                    <div>
                        <p className={groupTitleClass}>{t.organizerEvent.groups.people}</p>
                        <NavLink to={`/organizer/events/${eventId}/orders`} className={menuLinkClass}>
                            {t.organizerOrders.title}
                        </NavLink>
                        <NavLink to={`/organizer/events/${eventId}/refunds`} className={({ isActive }) => `${menuLinkClass({ isActive })} justify-between`}>
                            {t.organizerRefunds.title}
                            {pendingRefunds.length > 0 && (
                                <span className="rounded-full bg-badge-warning-bg px-2 py-0.5 text-xs font-semibold text-badge-warning-fg">{pendingRefunds.length}</span>
                            )}
                        </NavLink>
                        <NavLink to={`/organizer/events/${eventId}/team`} className={menuLinkClass}>
                            {t.organizerTeam.title}
                        </NavLink>
                        {event?.visibility === 'PRIVATE' && (
                            <NavLink to={`/organizer/events/${eventId}/guests`} className={menuLinkClass}>
                                {t.organizerGuests.title}
                            </NavLink>
                        )}
                    </div>

                    <div>
                        <p className={groupTitleClass}>{t.organizerEvent.groups.support}</p>
                        <NavLink to={`/organizer/events/${eventId}/support`} className={({ isActive }) => `${menuLinkClass({ isActive })} justify-between`}>
                            {t.organizerSupport.title}
                            {queuedCases.length > 0 && (
                                <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-accent ring-1 ring-border">{queuedCases.length}</span>
                            )}
                        </NavLink>
                    </div>

                    <div>
                        <p className={groupTitleClass}>{t.organizerEvent.groups.moderation}</p>
                        <NavLink to={`/organizer/events/${eventId}/change-requests`} className={menuLinkClass}>
                            {t.organizerChanges.title}
                        </NavLink>
                    </div>

                    <div>
                        <p className={groupTitleClass}>{t.organizerEvent.groups.reports}</p>
                        <NavLink to={`/organizer/events/${eventId}/analytics`} className={menuLinkClass}>
                            {t.organizerAnalytics.title}
                        </NavLink>
                        <NavLink to={`/organizer/events/${eventId}/history`} className={menuLinkClass}>
                            {t.organizerHistory.title}
                        </NavLink>
                    </div>
                </nav>
            </aside>

            <main className="min-w-0">
                <Outlet />
            </main>
        </div>
    )
}

export default OrganizerEventLayout
