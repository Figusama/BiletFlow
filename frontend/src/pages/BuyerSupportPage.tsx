import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import type { RootState } from '../app/store'
import { primaryActionClass } from '../components/ui/ErrorState'
import BuyerCaseStatusBadge from '../features/support/components/BuyerCaseStatusBadge'
import { useMySupportCases } from '../features/support/api'
import { caseNumber, type SupportCase } from '../features/organizer/support'
import { useLanguage } from '../shared/i18n/language'
import { formatRelativeTime } from '../shared/lib/relativeTime'

type Tab = 'OPEN' | 'RESOLVED'

const tabs: Tab[] = ['OPEN', 'RESOLVED']

const tabClass = (isActive: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${isActive ? 'bg-night text-on-night' : 'text-foreground hover:bg-surface-sunk'}`

const caseSubtitle = (item: SupportCase, platformLabel: string, withPlatformLabel: string) => {
    const handler = item.case_scope === 'PLATFORM_SUPPORT' || item.escalated_to_platform ? withPlatformLabel : item.organizer_name
    return [item.event_title ?? platformLabel, handler].filter(Boolean).join(', ')
}

const BuyerSupportPage = () => {
    const { t, language } = useLanguage()
    const texts = t.buyerSupport
    const fullName = useSelector((state: RootState) => state.auth.user?.fullName)
    const [tab, setTab] = useState<Tab>('OPEN')
    const { data, isPending, isError } = useMySupportCases()

    const cases = data ?? []
    const isResolved = (status: string) => status === 'RESOLVED'
    const shown = cases.filter((item) => (tab === 'RESOLVED') === isResolved(item.status))
    const count = (value: Tab) => cases.filter((item) => (value === 'RESOLVED') === isResolved(item.status)).length

    return (
        <div className="mx-auto max-w-[1224px] px-4 pt-8 pb-16 sm:px-6">
            <div className="mx-auto max-w-3xl">
                <header className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        {fullName && <p className="text-xs font-bold tracking-widest text-accent uppercase">{fullName}</p>}
                        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.list.title}</h1>
                    </div>
                    <Link to="/support/new" className={primaryActionClass}>
                        {texts.list.newCase}
                    </Link>
                </header>

                <div role="tablist" aria-label={texts.list.title} className="mt-6 flex gap-1 self-start rounded-full border border-border bg-surface p-1 w-fit">
                    {tabs.map((value) => (
                        <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={tabClass(tab === value)}>
                            {texts.list.tabs[value]} <span className="opacity-70">{count(value)}</span>
                        </button>
                    ))}
                </div>

                <div className="mt-6 flex flex-col gap-3">
                    {isPending ? (
                        <div className="h-32 animate-pulse rounded-2xl bg-surface-sunk" />
                    ) : isError ? (
                        <p className="text-muted">{texts.list.loadFailed}</p>
                    ) : shown.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted">{texts.list.empty[tab]}</p>
                    ) : (
                        shown.map((item) => (
                            <Link
                                key={item.id}
                                to={item.id}
                                className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-5 py-4 transition-colors hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent"
                            >
                                <span
                                    aria-hidden={item.unread === 0}
                                    aria-label={item.unread > 0 ? texts.list.unread : undefined}
                                    className={`mt-2 size-2 shrink-0 rounded-full ${item.unread > 0 ? 'bg-accent' : 'bg-transparent'}`}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-semibold text-accent">
                                            <span className="font-mono">{caseNumber(item)}</span> {t.organizerSupport.categories[item.category]}
                                        </p>
                                        <BuyerCaseStatusBadge supportCase={item} />
                                    </div>
                                    <p className="mt-1 truncate text-sm text-muted">{caseSubtitle(item, texts.list.platform, texts.list.withPlatform)}</p>
                                </div>
                                <span className="shrink-0 text-sm text-muted">{formatRelativeTime(item.updated_at, language)}</span>
                            </Link>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}

export default BuyerSupportPage
