import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Textarea from '../components/ui/Textarea'
import type { SupportCategory } from '../features/organizer/support'
import { useSupportCase } from '../features/organizer/support'
import { createSupportCase, mySupportCasesKey, useOrderBrief, type SupportScope } from '../features/support/api'
import { useEvent } from '../features/events/api'
import { useMyTickets } from '../features/tickets/api'
import { useLanguage } from '../shared/i18n/language'

const MAX_MESSAGE_LENGTH = 5000

const eventTopics: SupportCategory[] = ['TICKETS', 'PAYMENT', 'REFUND', 'EVENT_INFO', 'SEATING', 'CHECK_IN', 'OTHER']

const platformTopics: SupportCategory[] = ['ACCOUNT', 'PAYMENT', 'REFUND', 'TICKETS', 'TECHNICAL', 'ORGANIZER', 'EVENT_COMPLAINT', 'OTHER']

const chipClass = 'inline-flex items-center rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-foreground'

const BuyerSupportNewPage = () => {
    const { t } = useLanguage()
    const texts = t.buyerSupport.newCase
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [params] = useSearchParams()
    const previousCaseId = params.get('previousCaseId')
    const { data: previous } = useSupportCase(previousCaseId ?? undefined)
    const { data: tickets = [] } = useMyTickets()

    const ticketId = params.get('ticketId') ?? previous?.ticket_id ?? null
    const ticket = tickets.find((item) => item.id === ticketId)
    const orderId = params.get('orderId') ?? previous?.order_id ?? ticket?.order_id ?? null
    const { data: order } = useOrderBrief(orderId)
    const { data: reportedEvent } = useEvent(params.get('eventId') ?? '')
    const eventId = order?.event_id ?? ticket?.event_id ?? previous?.event_id ?? reportedEvent?.id ?? null
    const eventTitle = order?.event_title ?? ticket?.event_title ?? previous?.event_title ?? reportedEvent?.title ?? null
    const orderNumber = order?.order_number ?? ticket?.order_number ?? previous?.order_number ?? null

    const [scopeChoice, setScopeChoice] = useState<SupportScope | null>(null)
    const defaultScope: SupportScope = eventId && previous?.case_scope !== 'PLATFORM_SUPPORT' && params.get('scope') !== 'platform' ? 'EVENT_SUPPORT' : 'PLATFORM_SUPPORT'
    const scope = eventId ? (scopeChoice ?? defaultScope) : 'PLATFORM_SUPPORT'
    const topics = scope === 'EVENT_SUPPORT' ? eventTopics : platformTopics.filter((value) => value !== 'EVENT_COMPLAINT' || eventId)

    const [category, setCategory] = useState<SupportCategory | null>(null)
    const [subject, setSubject] = useState('')
    const [message, setMessage] = useState('')
    const [clientMessageId] = useState(() => crypto.randomUUID())
    const [isSending, setIsSending] = useState(false)
    const [error, setError] = useState('')

    const preferredTopic = topics.find((value) => value === params.get('topic'))
    const selectedCategory = category && topics.includes(category) ? category : (preferredTopic ?? topics[0])
    const backTo = orderId ? `/orders/${orderId}` : '/support'

    const submit = async (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        const body = message.trim()
        if (!body) {
            setError(texts.messageRequired)
            return
        }
        setIsSending(true)
        setError('')
        try {
            const created = await createSupportCase({
                case_scope: scope,
                event_id: eventId,
                order_id: orderId,
                ticket_id: ticketId,
                previous_case_id: previousCaseId,
                category: selectedCategory,
                custom_subject: selectedCategory === 'OTHER' && subject.trim() ? subject.trim() : null,
                message: body,
                client_message_id: clientMessageId,
            })
            await queryClient.invalidateQueries({ queryKey: mySupportCasesKey })
            navigate(`/support/${created.id}`, { replace: true })
        } catch {
            setError(texts.failed)
            setIsSending(false)
        }
    }

    return (
        <div className="mx-auto max-w-[1224px] px-4 pt-8 pb-16 sm:px-6">
            <Link to={backTo} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
                ← {orderNumber && orderId ? texts.backToOrder(orderNumber) : t.buyerSupport.list.title}
            </Link>
            <p className="mt-6 text-xs font-bold tracking-widest text-accent uppercase">{t.buyerSupport.list.title}</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
                <form onSubmit={submit} noValidate className="rounded-2xl border border-border bg-surface p-6">
                    {eventId && (
                        <div>
                            <p className="text-sm font-semibold text-foreground">{texts.about}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {eventTitle && <span className={`${chipClass} bg-accent-soft font-medium text-accent`}>{eventTitle}</span>}
                                {orderNumber && (
                                    <span className={chipClass}>
                                        {texts.order} <span className="ml-1.5 font-mono text-xs">{orderNumber}</span>
                                    </span>
                                )}
                                {ticket && (
                                    <span className={chipClass}>
                                        {texts.ticket} <span className="ml-1.5 font-mono text-xs">{ticket.public_id}</span>
                                    </span>
                                )}
                            </div>
                            <p className="mt-2 text-xs text-muted">{scope === 'EVENT_SUPPORT' ? texts.eventNote : texts.platformNote}</p>
                        </div>
                    )}

                    <label htmlFor="support-topic" className="mt-5 block text-sm font-semibold text-foreground">
                        {texts.topic}
                    </label>
                    <div id="support-topic" className="mt-2">
                        <Select
                            fullWidth
                            ariaLabel={texts.topic}
                            value={selectedCategory}
                            options={topics.map((value) => ({ value, label: t.organizerSupport.categories[value] }))}
                            onValueChange={setCategory}
                        />
                    </div>

                    {selectedCategory === 'OTHER' && (
                        <>
                            <label htmlFor="support-subject" className="mt-5 block text-sm font-semibold text-foreground">
                                {texts.subject}
                            </label>
                            <Input id="support-subject" className="mt-2" value={subject} maxLength={200} onChange={(changeEvent) => setSubject(changeEvent.target.value)} />
                        </>
                    )}

                    <label htmlFor="support-message" className="mt-5 block text-sm font-semibold text-foreground">
                        {texts.message}
                    </label>
                    <Textarea
                        id="support-message"
                        className="mt-2 min-h-40"
                        value={message}
                        maxLength={MAX_MESSAGE_LENGTH}
                        hasError={Boolean(error) && !message.trim()}
                        onChange={(changeEvent) => setMessage(changeEvent.target.value)}
                    />

                    {error && (
                        <p role="alert" className="mt-3 text-sm text-error">
                            {error}
                        </p>
                    )}

                    <div className="mt-5 flex flex-wrap items-center gap-4">
                        <Button type="submit" shape="pill" disabled={isSending}>
                            {texts.send}
                        </Button>
                        {eventId && (
                            <button
                                type="button"
                                onClick={() => setScopeChoice(scope === 'EVENT_SUPPORT' ? 'PLATFORM_SUPPORT' : 'EVENT_SUPPORT')}
                                className="text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                            >
                                {scope === 'EVENT_SUPPORT' ? texts.platformSwitch : texts.eventSwitch}
                            </button>
                        )}
                    </div>
                </form>

                <aside className="rounded-2xl border border-border bg-surface p-6">
                    <h2 className="text-lg font-bold text-foreground">{texts.next.title}</h2>
                    <ul className="mt-4 flex flex-col gap-3 text-sm text-foreground">
                        {texts.next.items.map((item) => (
                            <li key={item} className="border-b border-border pb-3 last:border-0 last:pb-0">
                                {item}
                            </li>
                        ))}
                    </ul>
                    <Link to="/support" className="mt-4 inline-block text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
                        {texts.myCases}
                    </Link>
                </aside>
            </div>
        </div>
    )
}

export default BuyerSupportNewPage
