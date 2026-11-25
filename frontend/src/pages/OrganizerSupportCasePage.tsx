import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useSelector } from 'react-redux'
import { Link, useParams } from 'react-router-dom'
import type { RootState } from '../app/store'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import Select from '../components/ui/Select'
import Textarea from '../components/ui/Textarea'
import { useEventRefundRequests, useManagedEvent, type ManagedEvent } from '../features/organizer/api'
import { formatDateTime } from '../features/organizer/changes'
import SupportStatusBadge from '../features/organizer/components/SupportStatusBadge'
import { hoursLeft } from '../features/organizer/refunds'
import {
    assignCase,
    caseNumber,
    changeCaseStatus,
    claimCase,
    escalateCase,
    markCaseRead,
    matchesSupportTab,
    releaseCase,
    sendCaseMessage,
    supportCaseKey,
    supportCasesKey,
    useCaseAssignees,
    useEventSupportCases,
    useCaseOrder,
    useSupportCase,
    type SupportCaseDetail,
    type SupportCaseStatus,
    type SupportHistoryEntry,
    type SupportMessage,
} from '../features/organizer/support'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { formatTime } from '../shared/lib/date'
import { formatRelativeTime } from '../shared/lib/relativeTime'

const MAX_MESSAGE_LENGTH = 5000

type StaffStatus = Exclude<SupportCaseStatus, 'OPEN'>

const staffStatuses: StaffStatus[] = ['IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED']

type ThreadItem = { kind: 'message'; at: string; message: SupportMessage } | { kind: 'history'; at: string; entry: SupportHistoryEntry }

const OrganizerSupportCasePage = () => {
    const { t } = useLanguage()
    const { eventId = '' } = useParams()
    const { data: event, isPending, isError } = useManagedEvent(eventId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !event) return <p className="text-muted">{t.organizerEvent.loadFailed}</p>

    return <SupportCasePage event={event} />
}

const SupportCasePage = ({ event }: { event: ManagedEvent }) => {
    const { t } = useLanguage()
    const { caseId = '' } = useParams()
    const { data: supportCase, isPending, isError } = useSupportCase(caseId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !supportCase || supportCase.event_id !== event.id) return <p className="text-muted">{t.organizerSupport.notFound}</p>

    return <SupportCaseView key={supportCase.id} event={event} supportCase={supportCase} />
}

const SupportCaseView = ({ event, supportCase }: { event: ManagedEvent; supportCase: SupportCaseDetail }) => {
    const { t, language } = useLanguage()
    const texts = t.organizerSupport
    const queryClient = useQueryClient()
    const myUserId = useSelector((state: RootState) => state.auth.user?.id)
    const { data: cases = [] } = useEventSupportCases(event.id)
    const { data: refundRequests = [] } = useEventRefundRequests(event.id)
    const order = useCaseOrder(event.id, supportCase)
    const [reply, setReply] = useState('')
    const [clientMessageId, setClientMessageId] = useState(() => crypto.randomUUID())
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')

    const isResolved = supportCase.status === 'RESOLVED'
    const isWithPlatform = supportCase.escalated_to_platform && !isResolved
    const isMine = supportCase.assigned_to_user_id !== null && supportCase.assigned_to_user_id === myUserId
    const canReply = isMine && !isResolved && !supportCase.escalated_to_platform
    const canManage = !isResolved && !supportCase.escalated_to_platform
    const { data: assignees = [] } = useCaseAssignees(supportCase.id, canManage)

    const { id: caseId, unread, last_message_seq: lastSeq } = supportCase
    useEffect(() => {
        if (unread === 0 || supportCase.escalated_to_platform) return
        markCaseRead(caseId, lastSeq)
            .then(() => queryClient.invalidateQueries({ queryKey: supportCasesKey(event.id) }))
            .catch(() => undefined)
    }, [caseId, unread, lastSeq, supportCase.escalated_to_platform, event.id, queryClient])

    const nameOf = (userId: string | null, name: string | null) => {
        if (!userId) return texts.system
        if (userId === supportCase.requester_user_id) return name ?? texts.buyer
        if (userId === myUserId) return name ?? texts.you
        return name ?? texts.platformAgent
    }

    const run = async (action: () => Promise<SupportCaseDetail>) => {
        setIsBusy(true)
        setError('')
        try {
            const updated = await action()
            queryClient.setQueryData(supportCaseKey(updated.id), updated)
            queryClient.invalidateQueries({ queryKey: supportCasesKey(event.id) })
            return true
        } catch (caught) {
            setError(caught instanceof ApiError && (caught.status === 409 || caught.status === 403) ? texts.conflict : texts.failed)
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

    const openCases = cases.filter((item) => matchesSupportTab(item, 'ALL_OPEN', myUserId))
    const previousCase = cases.find((item) => item.id === supportCase.previous_case_id)
    const position = openCases.findIndex((item) => item.id === supportCase.id)

    const topic = supportCase.custom_subject ?? texts.categories[supportCase.category]
    const ticket = order?.tickets.find((item) => item.ticket_id === supportCase.ticket_id)
    const refund = order?.refund ? refundRequests.find((item) => item.id === order.refund?.id) : undefined

    const thread: ThreadItem[] = [
        ...supportCase.messages.map((message): ThreadItem => ({ kind: 'message', at: message.created_at, message })),
        ...supportCase.history
            .filter((entry) => entry.action !== 'CREATED')
            .map((entry): ThreadItem => ({ kind: 'history', at: entry.created_at, entry })),
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
                return texts.history.released(nameOf(entry.old_assignee_user_id, entry.old_assignee_name))
            case 'ESCALATED':
                return texts.history.escalated(actor)
            case 'RETURNED_TO_EVENT':
                return texts.history.returned
            case 'REOPENED':
                return texts.history.reopened
            case 'STATUS_CHANGED':
                return texts.history.statusChanged(actor, texts.status[(entry.new_status ?? 'OPEN') as SupportCaseStatus])
            default:
                return entry.action
        }
    }

    const assigneeOptions = assignees.map((member) => ({
        value: member.user_id,
        label: member.user_id === myUserId ? `${member.full_name ?? texts.platformAgent} (${texts.you})` : member.full_name ?? texts.platformAgent,
    }))

    const assigneeLabel = isWithPlatform
        ? undefined
        : supportCase.assigned_to_user_id
          ? supportCase.assigned_to_user_id === myUserId
              ? texts.you
              : nameOf(supportCase.assigned_to_user_id, supportCase.assignee_name)
          : isResolved
            ? undefined
            : texts.unassigned

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                    to=".."
                    relative="path"
                    className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                    <Icon name="chevron-left" className="size-4" />
                    {texts.title}
                </Link>
                {position >= 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted">
                        {texts.position(position + 1, openCases.length)}
                        <Link
                            to={`../${openCases[position - 1]?.id ?? ''}`}
                            relative="path"
                            aria-label={texts.previous}
                            aria-disabled={position === 0}
                            tabIndex={position === 0 ? -1 : 0}
                            className={`flex size-8 items-center justify-center rounded-full bg-surface-sunk ${position === 0 ? 'pointer-events-none opacity-40' : 'hover:text-accent'}`}
                        >
                            <Icon name="chevron-left" className="size-4" />
                        </Link>
                        <Link
                            to={`../${openCases[position + 1]?.id ?? ''}`}
                            relative="path"
                            aria-label={texts.next}
                            aria-disabled={position === openCases.length - 1}
                            tabIndex={position === openCases.length - 1 ? -1 : 0}
                            className={`flex size-8 items-center justify-center rounded-full bg-surface-sunk ${position === openCases.length - 1 ? 'pointer-events-none opacity-40' : 'hover:text-accent'}`}
                        >
                            <Icon name="chevron-left" className="size-4 rotate-180" />
                        </Link>
                    </div>
                )}
            </div>

            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{event.title}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                        <span className="font-mono">{caseNumber(supportCase)}</span> {topic}
                    </h1>
                    <p className="mt-1 text-sm text-muted">
                        {[
                            supportCase.requester_name ?? texts.buyer,
                            supportCase.order_number && texts.orderLabel(supportCase.order_number),
                            texts.openedAt(formatDateTime(supportCase.created_at, event.timezone, t)),
                        ]
                            .filter(Boolean)
                            .join(', ')}
                    </p>
                </div>
                <SupportStatusBadge supportCase={supportCase} assigneeLabel={assigneeLabel} />
            </header>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
                <section aria-label={texts.thread} className="rounded-2xl border border-border bg-surface p-5">
                    <ol className="flex flex-col gap-4">
                        {thread.map((item) =>
                            item.kind === 'message' ? (
                                <li
                                    key={item.message.id}
                                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${item.message.from_requester ? 'self-start bg-surface-sunk' : 'self-end bg-accent-soft'}`}
                                >
                                    <p className="text-xs font-semibold text-muted">
                                        {nameOf(item.message.sender_user_id, item.message.sender_name)}, {formatRelativeTime(item.message.created_at, language)}
                                    </p>
                                    <p className="mt-1 text-sm whitespace-pre-line text-foreground">{item.message.body}</p>
                                </li>
                            ) : (
                                <li key={`${item.entry.action}-${item.at}`} className="self-center text-center text-xs text-muted">
                                    {historyText(item.entry)}, {formatTime(new Date(item.at), event.timezone)}
                                </li>
                            ),
                        )}
                    </ol>

                    {!isResolved && !supportCase.escalated_to_platform && (
                        <form onSubmit={sendReply} className="mt-5 border-t border-border pt-5">
                            <label htmlFor="support-reply" className="sr-only">
                                {texts.reply}
                            </label>
                            <Textarea
                                id="support-reply"
                                value={reply}
                                maxLength={MAX_MESSAGE_LENGTH}
                                disabled={!canReply || isBusy}
                                placeholder={canReply ? texts.replyPlaceholder : texts.takeToReply}
                                className="min-h-24 disabled:cursor-not-allowed"
                                onChange={(changeEvent) => setReply(changeEvent.target.value)}
                            />
                            {canReply && (
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-xs text-muted">{texts.replyHint}</p>
                                    <Button type="submit" shape="pill" disabled={isBusy || !reply.trim()}>
                                        {texts.send}
                                    </Button>
                                </div>
                            )}
                        </form>
                    )}
                </section>

                <div className="flex flex-col gap-4">
                    <section className="rounded-2xl border border-border bg-surface p-5">
                        {isWithPlatform ? (
                            <>
                                <h2 className="text-lg font-bold text-foreground">{texts.withPlatform}</h2>
                                <p className="mt-2 text-sm text-muted">{texts.withPlatformNote}</p>
                            </>
                        ) : isResolved ? (
                            <>
                                <h2 className="text-lg font-bold text-foreground">{texts.status.RESOLVED}</h2>
                                <p className="mt-2 text-sm text-muted">
                                    {texts.resolvedNote(formatDateTime(supportCase.resolved_at ?? supportCase.updated_at, event.timezone, t))}
                                </p>
                            </>
                        ) : supportCase.assigned_to_user_id === null ? (
                            <>
                                <h2 className="text-lg font-bold text-foreground">{texts.notTaken}</h2>
                                <p className="mt-2 text-sm text-muted">{texts.notTakenNote}</p>
                                <Button className="mt-4" fullWidth shape="pill" disabled={isBusy} onClick={() => run(() => claimCase(supportCase.id))}>
                                    {texts.take}
                                </Button>
                            </>
                        ) : (
                            <>
                                <h2 className="text-lg font-bold text-foreground">{texts.case}</h2>
                                <p className="mt-4 text-sm font-medium text-foreground">{texts.statusLabel}</p>
                                <div className="mt-2">
                                    <Select
                                        fullWidth
                                        ariaLabel={texts.statusLabel}
                                        value={supportCase.status as StaffStatus}
                                        options={staffStatuses.map((value) => ({ value, label: texts.status[value] }))}
                                        onValueChange={(value) => run(() => changeCaseStatus(supportCase.id, value))}
                                    />
                                </div>
                                <p className="mt-4 text-sm font-medium text-foreground">{texts.assignedTo}</p>
                                <div className="mt-2">
                                    <Select
                                        fullWidth
                                        ariaLabel={texts.assignedTo}
                                        value={supportCase.assigned_to_user_id}
                                        options={
                                            assigneeOptions.some((option) => option.value === supportCase.assigned_to_user_id)
                                                ? assigneeOptions
                                                : [...assigneeOptions, { value: supportCase.assigned_to_user_id, label: nameOf(supportCase.assigned_to_user_id, supportCase.assignee_name) }]
                                        }
                                        onValueChange={(userId) => run(() => assignCase(supportCase.id, userId))}
                                    />
                                </div>
                                {assigneeOptions.length < 2 && <p className="mt-2 text-xs text-muted">{texts.noStaffHint}</p>}
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Button variant="secondary" size="sm" shape="pill" disabled={isBusy} onClick={() => run(() => releaseCase(supportCase.id))}>
                                        {texts.release}
                                    </Button>
                                    <Button variant="secondary" size="sm" shape="pill" disabled={isBusy} onClick={() => run(() => escalateCase(supportCase.id))}>
                                        {texts.escalate}
                                    </Button>
                                </div>
                            </>
                        )}
                        {canManage && supportCase.assigned_to_user_id === null && (
                            <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => run(() => escalateCase(supportCase.id))}
                                className="mt-3 w-full text-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
                            >
                                {texts.escalate}
                            </button>
                        )}
                        {error && (
                            <p role="alert" className="mt-4 text-sm text-error">
                                {error}
                            </p>
                        )}
                    </section>

                    {(order || supportCase.previous_case_id) && (
                        <section className="rounded-2xl border border-border bg-surface p-5">
                            <h2 className="text-lg font-bold text-foreground">{texts.related}</h2>
                            <ul className="mt-3 flex flex-col gap-2 text-sm">
                                {order && (
                                    <li>
                                        <Link to={`../../orders/${order.id}`} relative="path" className="text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
                                            {texts.orderLabel(order.order_number)}
                                        </Link>
                                    </li>
                                )}
                                {ticket && (
                                    <li className="text-foreground">
                                        {texts.ticketLabel(ticket.ticket_public_id)}
                                        <span className="text-muted">{`, ${ticket.attendee_name}`}</span>
                                    </li>
                                )}
                                {order?.refund && (
                                    <li>
                                        <Link
                                            to={`../../refunds/${order.refund.id}`}
                                            relative="path"
                                            className="text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                                        >
                                            {texts.refundLabel}
                                        </Link>
                                        {refund?.status === 'PENDING' && <span className="text-muted">{`, ${t.organizerRefunds.hoursLeft(hoursLeft(refund))}`}</span>}
                                    </li>
                                )}
                                {supportCase.previous_case_id && (
                                    <li>
                                        <Link
                                            to={`../${supportCase.previous_case_id}`}
                                            relative="path"
                                            className="text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                                        >
                                            {texts.previousCase(previousCase ? caseNumber(previousCase) : '')}
                                        </Link>
                                    </li>
                                )}
                            </ul>
                        </section>
                    )}
                </div>
            </div>
        </div>
    )
}

export default OrganizerSupportCasePage
