import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import StatusBadge from '../components/ui/StatusBadge'
import {
    useAdminUsers,
    userJoinedFilters,
    userRoleFilters,
    userStatusFilters,
    type AdminUser,
    type UserJoinedFilter,
    type UserRoleFilter,
    type UserStatusFilter,
} from '../features/admin/api'
import { formatDateTime } from '../features/organizer/changes'
import { useLanguage } from '../shared/i18n/language'

const PAGE_SIZE = 20
const TIME_ZONE = 'Asia/Almaty'

const pagerButton =
    'flex size-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'

const eventRolesSummary = (user: AdminUser, names: Record<string, string>) => {
    if (user.event_roles.length === 0) return '—'
    const counts = new Map<string, number>()
    user.event_roles.forEach((eventRole) => counts.set(eventRole.role, (counts.get(eventRole.role) ?? 0) + 1))
    return [...counts].map(([role, count]) => `${names[role]} (${count})`).join(', ')
}

const AdminUsersPage = () => {
    const { t } = useLanguage()
    const texts = t.admin.users
    const [status, setStatus] = useState<UserStatusFilter>('ALL')
    const [role, setRole] = useState<UserRoleFilter>('ALL')
    const [joined, setJoined] = useState<UserJoinedFilter>('ALL')
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(0)
    const { data, isPending, isError } = useAdminUsers({
        status,
        role,
        joined,
        search,
        page,
        pageSize: PAGE_SIZE,
    })

    const users = data?.items ?? []
    const total = data?.total ?? 0
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

    return (
        <div className="flex flex-col gap-6">
            <header>
                <p className="text-xs font-bold tracking-widest text-accent uppercase">{t.admin.groups.directory}</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
            </header>

            <form
                className="flex flex-wrap items-center gap-3"
                onSubmit={(submitEvent) => {
                    submitEvent.preventDefault()
                    setSearch(searchInput.trim())
                    setPage(0)
                }}
            >
                <div className="w-full max-w-sm">
                    <label htmlFor="user-search" className="sr-only">
                        {texts.searchPlaceholder}
                    </label>
                    <Input
                        id="user-search"
                        type="search"
                        value={searchInput}
                        placeholder={texts.searchPlaceholder}
                        onChange={(changeEvent) => setSearchInput(changeEvent.target.value)}
                    />
                </div>
                <Select
                    value={status}
                    ariaLabel={texts.statusFilter}
                    options={userStatusFilters.map((value) => ({
                        value,
                        label: texts.filters[value],
                    }))}
                    onValueChange={(value) => {
                        setStatus(value)
                        setPage(0)
                    }}
                />
                <Select
                    value={role}
                    ariaLabel={texts.roleFilter}
                    options={userRoleFilters.map((value) => ({
                        value,
                        label: texts.roleFilters[value],
                    }))}
                    onValueChange={(value) => {
                        setRole(value)
                        setPage(0)
                    }}
                />
                <Select
                    value={joined}
                    ariaLabel={texts.joinedFilter}
                    options={userJoinedFilters.map((value) => ({
                        value,
                        label: texts.joinedFilters[value],
                    }))}
                    onValueChange={(value) => {
                        setJoined(value)
                        setPage(0)
                    }}
                />
            </form>

            {isPending ? (
                <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : users.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty}</p>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <table className="w-full min-w-[720px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.columns.user}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.publicId}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.role}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.eventRoles}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.joined}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.status}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {users.map((user) => (
                                <tr key={user.id} className="align-top">
                                    <td className="px-5 py-3">
                                        <Link to={user.public_id} className="font-semibold text-foreground hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
                                            {user.full_name ?? user.email}
                                        </Link>
                                        {user.full_name && <p className="mt-0.5 text-xs text-muted">{user.email}</p>}
                                    </td>
                                    <td className="px-5 py-3 font-mono text-xs whitespace-nowrap text-muted">{user.public_id}</td>
                                    <td className="px-5 py-3 text-foreground">{texts.roles[user.personal_role]}</td>
                                    <td className="px-5 py-3 text-muted">{eventRolesSummary(user, texts.eventRoleNames)}</td>
                                    <td className="px-5 py-3 whitespace-nowrap text-muted">{formatDateTime(user.created_at, TIME_ZONE, t)}</td>
                                    <td className="px-5 py-3">
                                        {user.is_suspended ? (
                                            <StatusBadge tone="danger" icon="x-circle">
                                                {texts.suspended}
                                            </StatusBadge>
                                        ) : (
                                            <StatusBadge tone="success" icon="check-circle">
                                                {texts.active}
                                            </StatusBadge>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {users.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
                    <span>{texts.range(page * PAGE_SIZE + 1, page * PAGE_SIZE + users.length, total)}</span>
                    <div className="flex items-center gap-2">
                        <button type="button" aria-label={t.admin.applications.previousPage} disabled={page === 0} onClick={() => setPage(page - 1)} className={pagerButton}>
                            <Icon name="chevron-left" className="size-4" />
                        </button>
                        <span className="px-2 text-foreground">
                            {page + 1} / {pageCount}
                        </span>
                        <button type="button" aria-label={t.admin.applications.nextPage} disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)} className={pagerButton}>
                            <Icon name="chevron-left" className="size-4 rotate-180" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default AdminUsersPage
