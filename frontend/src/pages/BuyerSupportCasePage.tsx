import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useSelector } from 'react-redux'
import { Link, useParams } from 'react-router-dom'
import type { RootState } from '../app/store'
import Button from '../components/ui/Button'
import Textarea from '../components/ui/Textarea'
import { primaryActionClass, secondaryActionClass } from '../components/ui/ErrorState'
import {
    caseNumber,
    escalateCase,
    markCaseRead,
    sendCaseMessage,
    supportCaseKey,
    useSupportCase,
    type SupportCaseDetail,
    type SupportCaseStatus,
    type SupportHistoryEntry,
    type SupportMessage,
} from '../features/organizer/support'
import { mySupportCasesKey, reopenDeadline, reopenSupportCase } from '../features/support/api'
import BuyerCaseStatusBadge from '../features/support/components/BuyerCaseStatusBadge'
import { useMyTickets } from '../features/tickets/api'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { APP_TIME_ZONE, formatTime, getDateParts } from '../shared/lib/date'

const MAX_MESSAGE_LENGTH = 5000
const SUBJECT_LENGTH = 80

type ThreadItem = { kind: 'message'; at: string; message: SupportMessage } | { kind: 'history'; at: string; entry: SupportHistoryEntry }

const BuyerSupportCasePage = () => {
    const { t } = useLanguage()
    const { caseId = '' } = useParams()
    const { data: supportCase, isPending, isError } = useSupportCase(caseId)

    if (isPending) return <div className="mx-auto mt-8 h-64 max-w-[1224px] animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !supportCase) return <p className="mx-auto max-w-[1224px] px-4 pt-8 text-muted sm:px-6">{t.buyerSupport.case.notFound}</p>

    return <CaseView key={supportCase.id} supportCase={supportCase} />
}

const CaseView = ({ supportCase }: { supportCase: SupportCaseDetail }) => {
    const { t } = useLanguage()
    const texts = t.buyerSupport.case
    const queryClient = useQueryClient()
    const myUserId = useSelector((state: RootState) => state.auth.user?.id)
    const { data: tickets = [] } = useMyTickets()
    const [reply, setReply] = useState('')
    const [clientMessageId, setClientMessageId] = useState(() => crypto.randomUUID())
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')
    const [openedAt] = useState(() => Date.now())

    const isResolved = supportCase.status === 'RESOLVED'
    const ticket = tickets.find((item) => item.id === supportCase.ticket_id)
    const deadline = supportCase.resolved_at ? reopenDeadline(supportCase.resolved_at) : null
    const canReopen = deadline !== null && deadline.getTime() > openedAt

    const { id: caseId, unread, last_message_seq: lastSeq } = supportCase
    useEffect(() => {
        if (unread === 0) return
        markCaseRead(caseId, lastSeq)
            .then(() => queryClient.invalidateQueries({ queryKey: mySupportCasesKey }))
            .catch(() => undefined)
    }, [caseId, unread, lastSeq, queryClient])

    const formatStamp = (iso: string) => {
        const date = new Date(iso)
        const { day, month } = getDateParts(date, APP_TIME_ZONE)
        return `${day} ${t.dates.monthsShort[month]}, ${formatTime(date, APP_TIME_ZONE)}`
    }

    const formatDay = (date: Date) => {
        const { day, month } = getDateParts(date, APP_TIME_ZONE)
        return `${day} ${t.dates.monthsShort[month]}`
    }

    const nameOf = (userId: string | null, name: string | null) => {
        if (!userId) return texts.system
        if (userId === myUserId) return texts.you
        return name ?? texts.platformAgent
    }

    const senderLabel = (message: SupportMessage) => {
        if (message.sender_user_id === myUserId) return texts.you
        const name = message.sender_name ?? texts.platformAgent
        return supportCase.case_scope === 'EVENT_SUPPORT' && !supportCase.escalated_to_platform && supportCase.organizer_name ? `${name} · ${supportCase.organizer_name}` : name
    }

    const run = async (action: () => Promise<SupportCaseDetail>) => {
        setIsBusy(true)
        setError('')
        try {
            const updated = await action()
            queryClient.setQueryData(supportCaseKey(updated.id), updated)
            queryClient.invalidateQueries({ queryKey: mySupportCasesKey })
            return true
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 409 ? texts.conflict : texts.failed)
            queryClient.invalidateQueries({ queryKey: supportCaseKey(supportCase.id) })
            return false
        } finally {
            setIsBusy(false)
        }
    }

    const sendReply = async (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        const body = reply.trim()
        if (!body) return
        if (await run(() => sendCaseMessage(supportCase.id, body, clientMessageId))) {
            setReply('')
            setClientMessageId(crypto.randomUUID())
        }
    }

    const firstMessage = supportCase.messages[0]?.body.trim().split('\n')[0] ?? ''
    const title =
        supportCase.custom_subject ??
        (firstMessage.length > SUBJECT_LENGTH ? `${firstMessage.slice(0, SUBJECT_LENGTH)}…` : firstMessage || t.organizerSupport.categories[supportCase.category])

    const thread: ThreadItem[] = [
        ...supportCase.messages.map((message): ThreadItem => ({ kind: 'message', at: message.created_at, message })),
        ...supportCase.history.filter((entry) => entry.action !== 'CREATED').map((entry): ThreadItem => ({ kind: 'history', at: entry.created_at, entry })),
    ].sort((first, second) => new Date(first.at).getTime() - new Date(second.at).getTime())

    const historyText = (entry: SupportHistoryEntry) => {
        const actor = nameOf(entry.actor_user_id, entry.actor_name)
        switch (entry.action) {
            case 'CLAIMED':
                return texts.history.claimed(actor)
            case 'ASSIGNED':
                return texts.history.assigned(actor, nameOf(entry.new_assignee_user_id, entry.new_assignee_name))
            case 'RELEASED':
            case 'UNASSIGNED':
                return texts.history.released
            case 'ESCALATED':
                return entry.actor_user_id === myUserId ? texts.history.escalatedByYou : texts.history.escalated(actor)
            case 'RETURNED_TO_EVENT':
                return texts.history.returned
            case 'REOPENED':
                return texts.history.reopened
            case 'STATUS_CHANGED':
                return entry.new_status === 'RESOLVED'
                    ? texts.history.resolved(actor)
                    : texts.history.statusChanged(t.buyerSupport.status[(entry.new_status ?? 'OPEN') as SupportCaseStatus])
            default:
                return entry.action
        }
    }

    const canEscalate = !isResolved && supportCase.case_scope === 'EVENT_SUPPORT' && !supportCase.escalated_to_platform
    const handledBy = [
        supportCase.escalated_to_platform || supportCase.case_scope === 'PLATFORM_SUPPORT' ? t.buyerSupport.list.withPlatform : supportCase.organizer_name,
        supportCase.assignee_name,
    ]
        .filter(Boolean)
        .join(' · ')

    return (
        <div className="mx-auto max-w-[1224px] px-4 pt-8 pb-16 sm:px-6">
            <Link to="/support" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
                ← {t.buyerSupport.list.title}
            </Link>

            <header className="mt-6 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">
                        {texts.kicker(caseNumber(supportCase), t.organizerSupport.categories[supportCase.category])}
                    </p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
                </div>
                <BuyerCaseStatusBadge supportCase={supportCase} />
            </header>

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
                <section aria-label={texts.thread} className="rounded-2xl border border-border bg-surface p-5">
                    <ol className="flex flex-col gap-4">
                        {thread.map((item) =>
                            item.kind === 'message' ? (
                                <li
                                    key={item.message.id}
                                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${item.message.from_requester ? 'self-end bg-accent-soft' : 'self-start bg-surface-sunk'}`}
                                >
                                    <p className="text-xs font-semibold text-muted">
                                        {senderLabel(item.message)} · {formatStamp(item.message.created_at)}
                                    </p>
                                    <p className="mt-1 text-sm whitespace-pre-line text-foreground">{item.message.body}</p>
                                </li>
                            ) : (
                                <li key={`${item.entry.action}-${item.at}`} className="self-center text-center text-xs text-muted">
                                    {historyText(item.entry)} · {formatTime(new Date(item.at), APP_TIME_ZONE)}
                                </li>
                            ),
                        )}
                    </ol>

                    {isResolved ? (
                        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-surface-sunk px-5 py-4">
                            <div>
                                <p className="font-semibold text-foreground">{texts.resolved.title(formatDay(new Date(supportCase.resolved_at ?? supportCase.updated_at)))}</p>
                                <p className="mt-0.5 text-sm text-muted">{canReopen && deadline ? texts.resolved.reopenUntil(formatDay(deadline)) : texts.resolved.expired}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {canReopen && (
                                    <Button shape="pill" disabled={isBusy} onClick={() => run(() => reopenSupportCase(supportCase.id))}>
                                        {texts.resolved.reopen}
                                    </Button>
                                )}
                                <Link to={`/support/new?previousCaseId=${supportCase.id}`} className={canReopen ? secondaryActionClass : primaryActionClass}>
                                    {texts.resolved.newLinked}
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={sendReply} className="mt-5 border-t border-border pt-5">
                            <label htmlFor="buyer-support-reply" className="sr-only">
                                {texts.reply}
                            </label>
                            <Textarea
                                id="buyer-support-reply"
                                value={reply}
                                maxLength={MAX_MESSAGE_LENGTH}
                                disabled={isBusy}
                                placeholder={texts.replyPlaceholder}
                                className="min-h-24"
                                onChange={(changeEvent) => setReply(changeEvent.target.value)}
                            />
                            <div className="mt-3 flex items-center justify-between gap-3">
                                <p className="text-xs text-muted">{supportCase.status === 'WAITING_FOR_CUSTOMER' ? texts.replyHintWaiting : texts.replyHint}</p>
                                <Button type="submit" shape="pill" disabled={isBusy || !reply.trim()}>
                                    {texts.send}
                                </Button>
                            </div>
                        </form>
                    )}
                    {error && (
                        <p role="alert" className="mt-3 text-sm text-error">
                            {error}
                        </p>
                    )}
                </section>

                <div className="flex flex-col gap-4">
                    <section className="rounded-2xl border border-border bg-surface p-5">
                        <h2 className="text-lg font-bold text-foreground">{texts.about}</h2>
                        <dl className="mt-3 flex flex-col gap-2 text-sm">
                            {supportCase.event_title && (
                                <div className="flex justify-between gap-3">
                                    <dt className="text-muted">{texts.fields.event}</dt>
                                    <dd className="text-right font-medium text-foreground">{supportCase.event_title}</dd>
                                </div>
                            )}
                            {supportCase.order_number && (
                                <div className="flex justify-between gap-3">
                                    <dt className="text-muted">{texts.fields.order}</dt>
                                    <dd className="font-mono text-xs text-foreground">{supportCase.order_number}</dd>
                                </div>
                            )}
                            {ticket && (
                                <div className="flex justify-between gap-3">
                                    <dt className="text-muted">{texts.fields.ticket}</dt>
                                    <dd className="font-mono text-xs text-foreground">{ticket.public_id}</dd>
                                </div>
                            )}
                            <div className="flex justify-between gap-3">
                                <dt className="text-muted">{texts.fields.handledBy}</dt>
                                <dd className="text-right font-medium text-foreground">{handledBy || texts.notTaken}</dd>
                            </div>
                        </dl>
                    </section>

                    {canEscalate && (
                        <section className="rounded-2xl border border-border bg-surface p-5">
                            <h2 className="text-lg font-bold text-foreground">{texts.escalate.title}</h2>
                            <p className="mt-2 text-sm text-muted">{texts.escalate.text}</p>
                            <Button className="mt-4" variant="secondary" shape="pill" disabled={isBusy} onClick={() => run(() => escalateCase(supportCase.id))}>
                                {texts.escalate.button}
                            </Button>
                        </section>
                    )}
                    {!isResolved && supportCase.case_scope === 'EVENT_SUPPORT' && supportCase.escalated_to_platform && (
                        <section className="rounded-2xl border border-border bg-surface p-5">
                            <p className="text-sm text-muted">{texts.escalate.done}</p>
                        </section>
                    )}
                </div>
            </div>
        </div>
    )
}

export default BuyerSupportCasePage
