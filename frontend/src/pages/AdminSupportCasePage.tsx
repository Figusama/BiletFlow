import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useSelector } from 'react-redux'
import { Link, useParams } from 'react-router-dom'
import type { RootState } from '../app/store'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import Select from '../components/ui/Select'
import StatusBadge from '../components/ui/StatusBadge'
import Textarea from '../components/ui/Textarea'
import { adminRefundsKey, adminSupportKey, returnCaseToEvent, startFullRefund, useAdminEvents, useAdminOrderPayments } from '../features/admin/api'
import { formatDateTime } from '../features/organizer/changes'
import {
    caseNumber,
    changeCaseStatus,
    claimCase,
    markCaseRead,
    releaseCase,
    sendCaseMessage,
    supportCaseKey,
    useSupportCase,
    type SupportCaseDetail,
    type SupportCaseStatus,
    type SupportHistoryEntry,
    type SupportMessage,
} from '../features/organizer/support'
import { ApiError } from '../shared/api/client'
import { useLanguage } from '../shared/i18n/language'
import { formatTime } from '../shared/lib/date'
import { formatKzt } from '../shared/lib/money'
import { formatRelativeTime } from '../shared/lib/relativeTime'

const TIME_ZONE = 'Asia/Almaty'
const MAX_MESSAGE_LENGTH = 5000

type StaffStatus = Exclude<SupportCaseStatus, 'OPEN'>

const staffStatuses: StaffStatus[] = ['IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED']

type ThreadItem = { kind: 'message'; at: string; message: SupportMessage } | { kind: 'history'; at: string; entry: SupportHistoryEntry }

const AdminSupportCasePage = () => {
    const { t } = useLanguage()
    const { caseId = '' } = useParams()
    const { data: supportCase, isPending, isError } = useSupportCase(caseId)

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />
    if (isError || !supportCase) return <p className="text-muted">{t.organizerSupport.notFound}</p>

    return <CaseView key={supportCase.id} supportCase={supportCase} />
}

const CaseView = ({ supportCase }: { supportCase: SupportCaseDetail }) => {
    const { t, language } = useLanguage()
    const texts = t.organizerSupport
    const adminTexts = t.admin.support
    const queryClient = useQueryClient()
    const myUserId = useSelector((state: RootState) => state.auth.user?.id)
    const { data: events = [] } = useAdminEvents()
    const { data: payments = [] } = useAdminOrderPayments(supportCase.order_number)
    const [reply, setReply] = useState('')
    const [clientMessageId, setClientMessageId] = useState(() => crypto.randomUUID())
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')
    const [isConfirmingRefund, setIsConfirmingRefund] = useState(false)
    const [refundStarted, setRefundStarted] = useState(false)

    const isResolved = supportCase.status === 'RESOLVED'
    const isMine = supportCase.assigned_to_user_id !== null && supportCase.assigned_to_user_id === myUserId
    const canReply = isMine && !isResolved
    const eventTitle = events.find((event) => event.id === supportCase.event_id)?.title
    const payment = payments.find((item) => item.order_number === supportCase.order_number)

    const { id: caseId, unread, last_message_seq: lastSeq } = supportCase
    useEffect(() => {
        if (unread === 0) return
        markCaseRead(caseId, lastSeq)
            .then(() => queryClient.invalidateQueries({ queryKey: adminSupportKey }))
            .catch(() => undefined)
    }, [caseId, unread, lastSeq, queryClient])

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
            queryClient.invalidateQueries({ queryKey: adminSupportKey })
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

    const refund = async () => {
        if (!supportCase.order_id) return
        setIsBusy(true)
        setError('')
        try {
            await startFullRefund(supportCase.order_id, null)
            setRefundStarted(true)
            setIsConfirmingRefund(false)
            await queryClient.invalidateQueries({ queryKey: adminRefundsKey })
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 409 ? adminTexts.refundConflict : texts.failed)
        } finally {
            setIsBusy(false)
        }
    }

    const topic = supportCase.custom_subject ?? texts.categories[supportCase.category]

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

    const statusLabel = `${texts.status[supportCase.status]}${supportCase.assignee_name ? `, ${supportCase.assignee_name}` : ''}`

    return (
        <div className="flex flex-col gap-6">
            <Link
                to="/admin/support"
                className="inline-flex items-center gap-1 self-start text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
                <Icon name="chevron-left" className="size-4" />
                {texts.title}
            </Link>

            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">
                        {supportCase.case_scope === 'PLATFORM_SUPPORT' ? adminTexts.platformScope : adminTexts.escalatedFrom(eventTitle ?? '—')}
                    </p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                        <span className="font-mono">{caseNumber(supportCase)}</span> {topic}
                    </h1>
                    <p className="mt-1 text-sm text-muted">
                        {[
                            supportCase.requester_name ?? texts.buyer,
                            supportCase.order_number && texts.orderLabel(supportCase.order_number),
                            texts.openedAt(formatDateTime(supportCase.created_at, TIME_ZONE, t)),
                        ]
                            .filter(Boolean)
                            .join(', ')}
                    </p>
                </div>
                <StatusBadge tone={isResolved ? 'success' : supportCase.status === 'OPEN' ? 'warning' : 'neutral'} icon={isResolved ? 'check-circle' : 'clock'}>
                    {statusLabel}
                </StatusBadge>
            </header>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
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
                                    {historyText(item.entry)}, {formatTime(new Date(item.at), TIME_ZONE)}
                                </li>
                            ),
                        )}
                    </ol>

                    {!isResolved && (
                        <form onSubmit={sendReply} className="mt-5 border-t border-border pt-5">
                            <label htmlFor="admin-support-reply" className="sr-only">
                                {texts.reply}
                            </label>
                            <Textarea
                                id="admin-support-reply"
                                value={reply}
                                maxLength={MAX_MESSAGE_LENGTH}
                                disabled={!canReply || isBusy}
                                placeholder={canReply ? texts.replyPlaceholder : texts.takeToReply}
                                className="min-h-24 disabled:cursor-not-allowed"
                                onChange={(changeEvent) => setReply(changeEvent.target.value)}
                            />
                            {canReply && (
                                <div className="mt-3 flex justify-end">
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
                        {isResolved ? (
                            <>
                                <h2 className="text-lg font-bold text-foreground">{texts.status.RESOLVED}</h2>
                                <p className="mt-2 text-sm text-muted">
                                    {texts.resolvedNote(formatDateTime(supportCase.resolved_at ?? supportCase.updated_at, TIME_ZONE, t))}
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
                        ) : isMine ? (
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
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Button variant="secondary" size="sm" shape="pill" disabled={isBusy} onClick={() => run(() => releaseCase(supportCase.id))}>
                                        {texts.release}
                                    </Button>
                                    {supportCase.escalated_to_platform && (
                                        <Button variant="secondary" size="sm" shape="pill" disabled={isBusy} onClick={() => run(() => returnCaseToEvent(supportCase.id))}>
                                            {adminTexts.returnToEvent}
                                        </Button>
                                    )}
                                </div>
                                {supportCase.escalated_to_platform && <p className="mt-3 text-xs text-muted">{adminTexts.returnHint}</p>}
                            </>
                        ) : (
                            <>
                                <h2 className="text-lg font-bold text-foreground">{texts.case}</h2>
                                <p className="mt-2 text-sm text-muted">{adminTexts.takenBy(supportCase.assignee_name ?? texts.platformAgent)}</p>
                            </>
                        )}
                        {error && (
                            <p role="alert" className="mt-4 text-sm text-error">
                                {error}
                            </p>
                        )}
                    </section>

                    {supportCase.order_number && (
                        <section className="rounded-2xl border border-border bg-surface p-5">
                            <h2 className="text-lg font-bold text-foreground">{adminTexts.order}</h2>
                            <dl className="mt-3 flex flex-col gap-2 text-sm">
                                <div className="flex justify-between gap-3">
                                    <dt className="text-muted">{adminTexts.orderNumber}</dt>
                                    <dd className="font-mono text-xs text-foreground">{supportCase.order_number}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="text-muted">{adminTexts.payment}</dt>
                                    <dd className="text-foreground">{payment ? `${t.admin.payments.status[payment.status]}, ${formatKzt(payment.amount_minor)}` : '—'}</dd>
                                </div>
                            </dl>
                            {supportCase.order_id && (
                                <div className="mt-4">
                                    {refundStarted ? (
                                        <p className="text-sm text-muted">{adminTexts.refundStarted}</p>
                                    ) : isConfirmingRefund ? (
                                        <div>
                                            <p className="text-sm text-foreground">{adminTexts.refundConfirm}</p>
                                            <div className="mt-3 flex gap-2">
                                                <Button size="sm" shape="pill" disabled={isBusy} onClick={refund}>
                                                    {adminTexts.refundYes}
                                                </Button>
                                                <Button size="sm" variant="secondary" shape="pill" disabled={isBusy} onClick={() => setIsConfirmingRefund(false)}>
                                                    {adminTexts.refundNo}
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setIsConfirmingRefund(true)}
                                            className="text-sm font-medium text-error hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                                        >
                                            {adminTexts.startRefund}
                                        </button>
                                    )}
                                </div>
                            )}
                        </section>
                    )}
                </div>
            </div>
        </div>
    )
}

export default AdminSupportCasePage
