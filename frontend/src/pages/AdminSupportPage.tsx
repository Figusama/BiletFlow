import { useState } from 'react'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import type { RootState } from '../app/store'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import StatusBadge from '../components/ui/StatusBadge'
import { useAdminEvents, useAdminSupportCases } from '../features/admin/api'
import { caseNumber, type SupportCase, type SupportCaseStatus, type SupportCategory } from '../features/organizer/support'
import { useLanguage } from '../shared/i18n/language'
import { formatRelativeTime } from '../shared/lib/relativeTime'

type AdminSupportTab = 'QUEUE' | 'ESCALATED' | 'MINE' | 'RESOLVED'

const tabs: AdminSupportTab[] = ['QUEUE', 'ESCALATED', 'MINE', 'RESOLVED']

const categoryValues: SupportCategory[] = ['TICKETS', 'PAYMENT', 'REFUND', 'EVENT_INFO', 'ACCOUNT', 'ORGANIZER', 'SEATING', 'CHECK_IN', 'TECHNICAL', 'EVENT_COMPLAINT', 'OTHER']

const matchesTab = (supportCase: SupportCase, tab: AdminSupportTab, myUserId: string | undefined) => {
    const isOpen = supportCase.status !== 'RESOLVED'
    switch (tab) {
        case 'QUEUE':
            return isOpen && supportCase.case_scope === 'PLATFORM_SUPPORT' && !supportCase.escalated_to_platform
        case 'ESCALATED':
            return isOpen && supportCase.escalated_to_platform
        case 'MINE':
            return isOpen && supportCase.assigned_to_user_id !== null && supportCase.assigned_to_user_id === myUserId
        case 'RESOLVED':
            return !isOpen
    }
}

const statusBadge = (status: SupportCaseStatus) =>
    status === 'RESOLVED' ? { tone: 'success' as const, icon: 'check-circle' as const } : status === 'OPEN' ? { tone: 'warning' as const, icon: 'clock' as const } : { tone: 'neutral' as const, icon: 'clock' as const }

const AdminSupportPage = () => {
    const { t, language } = useLanguage()
    const texts = t.admin.support
    const myUserId = useSelector((state: RootState) => state.auth.user?.id)
    const [tab, setTab] = useState<AdminSupportTab>('QUEUE')
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState<SupportCategory | 'ALL'>('ALL')
    const { data, isPending, isError } = useAdminSupportCases()
    const { data: events = [] } = useAdminEvents()

    const cases = data ?? []
    const count = (value: AdminSupportTab) => cases.filter((item) => matchesTab(item, value, myUserId)).length
    const eventTitle = (eventId: string | null) => events.find((event) => event.id === eventId)?.title

    const query = search.trim().toLowerCase().replace(/^#/, '')
    const visible = cases
        .filter((item) => matchesTab(item, tab, myUserId))
        .filter((item) => category === 'ALL' || item.category === category)
        .filter(
            (item) =>
                !query ||
                [String(item.case_number), item.requester_name, item.order_number, eventTitle(item.event_id)].some((value) => value?.toLowerCase().includes(query)),
        )
        .sort((first, second) => new Date(second.updated_at).getTime() - new Date(first.updated_at).getTime())

    return (
        <div className="flex flex-col gap-6">
            <header>
                <p className="text-xs font-bold tracking-widest text-accent uppercase">{t.admin.groups.support}</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
            </header>

            <div role="tablist" aria-label={texts.title} className="flex flex-wrap gap-1 self-start rounded-full border border-border bg-surface p-1">
                {tabs.map((value) => (
                    <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={tab === value}
                        onClick={() => setTab(value)}
                        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                            tab === value ? 'bg-night text-on-night' : 'text-foreground hover:bg-surface-sunk'
                        }`}
                    >
                        {texts.tabs[value]}
                        {value !== 'RESOLVED' && count(value) > 0 && <span className="ml-1.5 opacity-70">{count(value)}</span>}
                    </button>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="w-full max-w-sm">
                    <label htmlFor="support-search" className="sr-only">
                        {texts.searchPlaceholder}
                    </label>
                    <Input id="support-search" type="search" value={search} placeholder={texts.searchPlaceholder} onChange={(changeEvent) => setSearch(changeEvent.target.value)} />
                </div>
                <Select
                    value={category}
                    ariaLabel={texts.topic}
                    options={[{ value: 'ALL' as const, label: texts.anyTopic }, ...categoryValues.map((value) => ({ value, label: t.organizerSupport.categories[value] }))]}
                    onValueChange={setCategory}
                />
            </div>

            {isPending ? (
                <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : visible.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty[tab]}</p>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <table className="w-full min-w-[760px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.columns.case}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.from}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.topic}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.status}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.assigned}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {visible.map((item) => {
                                const badge = statusBadge(item.status)
                                return (
                                    <tr key={item.id} className="align-top">
                                        <td className="px-5 py-3">
                                            <Link to={item.id} className="font-mono font-semibold text-foreground hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
                                                {caseNumber(item)}
                                            </Link>
                                            {item.unread > 0 && <span aria-label={t.organizerSupport.unread} className="ml-2 inline-block size-2 rounded-full bg-accent" />}
                                            <p className="mt-0.5 text-xs text-muted">{item.case_scope === 'PLATFORM_SUPPORT' ? texts.platformScope : texts.escalatedFrom(eventTitle(item.event_id) ?? '—')}</p>
                                        </td>
                                        <td className="px-5 py-3 text-foreground">
                                            {item.requester_name ?? t.organizerSupport.buyer}
                                            <p className="text-xs text-muted">{formatRelativeTime(item.updated_at, language)}</p>
                                        </td>
                                        <td className="px-5 py-3 text-foreground">{item.custom_subject ?? t.organizerSupport.categories[item.category]}</td>
                                        <td className="px-5 py-3">
                                            <StatusBadge tone={badge.tone} icon={badge.icon}>
                                                {t.organizerSupport.status[item.status]}
                                            </StatusBadge>
                                        </td>
                                        <td className="px-5 py-3 text-foreground">{item.assignee_name ?? '—'}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

export default AdminSupportPage
