import { useSelector } from 'react-redux'
import { Link, NavLink, Outlet } from 'react-router-dom'
import type { RootState } from '../../../app/store'
import { useLanguage } from '../../../shared/i18n/language'
import { getInitials } from '../../../shared/lib/initials'

const groupTitleClass = 'mb-1 px-3 text-xs font-bold tracking-widest text-muted uppercase'

const menuLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center rounded-xl px-3 py-2.5 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
        isActive ? 'bg-accent-soft font-semibold text-accent' : 'text-foreground hover:bg-surface-sunk'
    }`

const AdminLayout = () => {
    const { t } = useLanguage()
    const user = useSelector((state: RootState) => state.auth.user)

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
                            <NavLink to="/admin/applications" className={menuLinkClass}>
                                {t.admin.applications.title}
                            </NavLink>
                        </div>
                    </nav>

                    {user && (
                        <div className="mt-5 flex items-center gap-3 border-t border-border px-2 pt-4">
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">
                                {getInitials(user.fullName)}
                            </span>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">{user.fullName}</p>
                                <p className="font-mono text-xs text-muted">{user.publicId}</p>
                            </div>
                        </div>
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
