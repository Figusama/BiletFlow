import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import type { RootState } from '../../../app/store'
import { useLanguage } from '../../../shared/i18n/language'
import { getInitials } from '../../../shared/lib/initials'
import { adminCountersKey, useAdminCounters } from '../api'

const groupTitleClass = 'mb-1 px-3 text-xs font-bold tracking-widest text-muted uppercase'

const menuLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center rounded-xl px-3 py-2.5 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
        isActive ? 'bg-accent-soft font-semibold text-accent' : 'text-foreground hover:bg-surface-sunk'
    }`

const MenuLink = ({ to, label, count = 0 }: { to: string; label: string; count?: number }) => (
    <NavLink to={to} className={menuLinkClass}>
        <span className="flex-1">{label}</span>
        {count > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">{count}</span>}
    </NavLink>
)

const AdminLayout = () => {
    const { t } = useLanguage()
    const user = useSelector((state: RootState) => state.auth.user)
    const queryClient = useQueryClient()
    const { pathname } = useLocation()
    const { data: counters } = useAdminCounters()

    useEffect(() => {
        queryClient.invalidateQueries({ queryKey: adminCountersKey })
    }, [pathname, queryClient])

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto grid max-w-[1176px] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[248px_minmax(0,1fr)] lg:items-start">
                <aside className="rounded-2xl border border-border bg-surface p-4 lg:sticky lg:top-8">
                    <div className="flex items-center gap-2 px-2">
                        <Link to="/" className="text-xl font-bold tracking-tight text-accent focus-visible:outline-2 focus-visible:outline-accent">
                            BiletFlow
                        </Link>
                        <span className="rounded-full bg-night px-2.5 py-0.5 text-xs font-semibold text-on-night">{t.admin.badge}</span>
                    </div>

                    <nav aria-label={t.admin.menu} className="mt-5 flex flex-col gap-4 border-t border-border pt-4">
                        <div>
                            <p className={groupTitleClass}>{t.admin.groups.moderation}</p>
                            <MenuLink to="/admin/applications" label={t.admin.applications.title} count={counters?.event_applications} />
                            <MenuLink to="/admin/change-requests" label={t.admin.changes.title} count={counters?.change_requests} />
                            <MenuLink to="/admin/paid-sales" label={t.admin.activations.title} count={counters?.paid_sales_requests} />
                            <MenuLink to="/admin/cancellations" label={t.admin.cancellations.title} count={counters?.cancellation_requests} />
                        </div>
                        <div>
                            <p className={groupTitleClass}>{t.admin.groups.commerce}</p>
                            <MenuLink to="/admin/payments" label={t.admin.payments.title} count={counters?.payments_overdue} />
                            <MenuLink to="/admin/refunds" label={t.admin.refunds.title} count={counters?.refund_requests} />
                        </div>
                        <div>
                            <p className={groupTitleClass}>{t.admin.groups.support}</p>
                            <MenuLink to="/admin/support" label={t.admin.support.title} count={counters?.support_unassigned} />
                        </div>
                        <div>
                            <p className={groupTitleClass}>{t.admin.groups.directory}</p>
                            <NavLink to="/admin/users" className={menuLinkClass}>
                                {t.admin.users.title}
                            </NavLink>
                            <NavLink to="/admin/events" className={menuLinkClass}>
                                {t.admin.events.title}
                            </NavLink>
                            <NavLink to="/admin/venues" className={menuLinkClass}>
                                {t.admin.venues.title}
                            </NavLink>
                        </div>
                        <div>
                            <p className={groupTitleClass}>{t.admin.groups.system}</p>
                            <NavLink to="/admin/audit" className={menuLinkClass}>
                                {t.admin.audit.title}
                            </NavLink>
                        </div>
                    </nav>

                    {user && (
                        <Link to="/account" className="mt-5 flex items-center gap-3 border-t border-border px-2 pt-4 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-accent">
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{getInitials(user.fullName)}</span>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">{user.fullName}</p>
                                <p className="font-mono text-xs text-muted">{user.publicId}</p>
                            </div>
                        </Link>
                    )}
                </aside>

                <main className="min-w-0">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}

export default AdminLayout
