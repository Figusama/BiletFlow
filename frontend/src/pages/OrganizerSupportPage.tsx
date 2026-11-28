import { useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useParams } from 'react-router-dom'
import type { RootState } from '../app/store'
import { useManagedEvent, type ManagedEvent } from '../features/organizer/api'
import SupportStatusBadge from '../features/organizer/components/SupportStatusBadge'
import {
    caseNumber,
    matchesSupportTab,
    supportTabs,
    useEventSupportCases,
    type SupportCase,
    type SupportTab,
} from '../features/organizer/support'
import { useLanguage } from '../shared/i18n/language'
import { formatRelativeTime } from '../shared/lib/relativeTime'

const OrganizerSupportPage = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event, isPending, isError } = useManagedEvent(eventId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !event) return <p className="text-muted">{t.organizerEvent.loadFailed}</p>

    return <SupportCases key={event.id} event={event} />
}

const SupportCases = ({ event }: { event: ManagedEvent }) => {
    const { t, language } = useLanguage()
    const texts = t.organizerSupport
    const myUserId = useSelector((state: RootState) => state.auth.user?.id)
    const [tab, setTab] = useState<SupportTab>('UNASSIGNED')
    const { data: cases = [], isPending, isError } = useEventSupportCases(event.id)

    const inTab = cases.filter((supportCase) => matchesSupportTab(supportCase, tab, myUserId))

    const assigneeName = (supportCase: SupportCase) => {
        if (!supportCase.assigned_to_user_id) return '—'
        if (supportCase.assigned_to_user_id === myUserId) return texts.you
        return supportCase.assignee_name ?? '—'
    }

    return (
        <div className="flex flex-col gap-6">
            <header>
                <p className="text-xs font-bold tracking-widest text-accent uppercase">{event.title}</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                <p className="mt-1 text-sm text-muted">{texts.intro}</p>
            </header>

            <div className="flex flex-wrap items-center gap-2">
                {supportTabs.map((value) => {
                    const count = cases.filter((supportCase) => matchesSupportTab(supportCase, value, myUserId)).length
                    return (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={tab === value}
                            onClick={() => setTab(value)}
                            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                                tab === value ? 'border-accent bg-accent-soft text-accent' : 'border-border text-foreground hover:border-border-strong'
                            }`}
                        >
                            {texts.tabs[value]}
                            {value !== 'RESOLVED' && ` ${count}`}
                        </button>
                    )
                })}
            </div>

            {isPending ? (
                <div className="h-40 animate-pulse rounded-2xl bg-surface-sunk" />
            ) : isError ? (
                <p className="text-muted">{texts.loadFailed}</p>
            ) : inTab.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.empty[tab]}</p>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <table className="w-full min-w-[720px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                                <th className="px-5 py-3 font-semibold">{texts.columns.case}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.from}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.topic}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.status}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.assigned}</th>
                                <th className="px-5 py-3 font-semibold">{texts.columns.lastActivity}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {inTab.map((supportCase) => (
                                <tr key={supportCase.id}>
                                    <td className="px-5 py-3">
                                        <Link
                                            to={supportCase.id}
                                            className="inline-flex items-center gap-2 font-mono font-semibold text-foreground hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                                        >
                                            <span
                                                aria-label={supportCase.unread > 0 ? texts.unread : undefined}
                                                className={`size-2 rounded-full ${supportCase.unread > 0 ? 'bg-accent' : 'bg-transparent'}`}
                                            />
                                            {caseNumber(supportCase)}
                                        </Link>
                                    </td>
                                    <td className="px-5 py-3 text-foreground">
                                        {supportCase.requester_name ?? texts.buyer}
                                    </td>
                                    <td className="px-5 py-3 text-foreground">{supportCase.custom_subject ?? texts.categories[supportCase.category]}</td>
                                    <td className="px-5 py-3">
                                        <SupportStatusBadge supportCase={supportCase} />
                                    </td>
                                    <td className="px-5 py-3 text-foreground">{assigneeName(supportCase)}</td>
                                    <td className="px-5 py-3 whitespace-nowrap text-muted">{formatRelativeTime(supportCase.updated_at, language)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <p className="text-xs text-muted">{texts.footnote}</p>
        </div>
    )
}

export default OrganizerSupportPage
