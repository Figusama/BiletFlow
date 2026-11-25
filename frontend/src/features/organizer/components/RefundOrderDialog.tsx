import { useEffect, useRef, useState } from 'react'
import Button from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import Textarea from '../../../components/ui/Textarea'
import { ApiError } from '../../../shared/api/client'
import { useLanguage } from '../../../shared/i18n/language'
import { formatKzt } from '../../../shared/lib/money'
import { refundWholeOrder, type EventOrder } from '../api'

interface RefundOrderDialogProps {
    order: EventOrder
    onClose: (refunded: boolean) => void
}

const RefundOrderDialog = ({ order, onClose }: RefundOrderDialogProps) => {
    const { t } = useLanguage()
    const texts = t.organizerOrders.refund
    const dialogRef = useRef<HTMLDialogElement>(null)
    const [comment, setComment] = useState('')
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        dialogRef.current?.showModal()
    }, [])

    const confirm = async () => {
        setIsBusy(true)
        setError('')
        try {
            await refundWholeOrder(order.id, comment.trim() || null)
            onClose(true)
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 409 ? texts.notAllowed : texts.failed)
            setIsBusy(false)
        }
    }

    return (
        <dialog
            ref={dialogRef}
            onClose={() => onClose(false)}
            aria-labelledby="refund-dialog-title"
            className="m-auto w-[min(520px,calc(100%-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/40"
        >
            <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                <div>
                    <p className="text-xs font-bold tracking-widest text-accent uppercase">{texts.eyebrow(order.order_number, order.buyer_name ?? order.buyer_email)}</p>
                    <h2 id="refund-dialog-title" className="mt-1 text-lg font-bold">
                        {texts.title}
                    </h2>
                </div>
                <button
                    type="button"
                    aria-label={texts.close}
                    onClick={() => dialogRef.current?.close()}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunk hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                >
                    <Icon name="close" className="size-4" />
                </button>
            </div>

            <div className="flex flex-col gap-4 p-5">
                <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-sunk p-4">
                    <p className="text-sm font-semibold">{texts.tickets(order.tickets)}</p>
                    <p className="text-2xl font-bold">{formatKzt(order.total_minor)}</p>
                </div>

                <div>
                    <label htmlFor="refund-comment" className="text-sm font-medium">
                        {texts.message}
                    </label>
                    <Textarea
                        id="refund-comment"
                        value={comment}
                        maxLength={2000}
                        className="mt-2 min-h-24"
                        onChange={(changeEvent) => setComment(changeEvent.target.value)}
                    />
                </div>

                <ul className="flex flex-col gap-2 text-sm text-muted">
                    {texts.notes.map((note) => (
                        <li key={note} className="flex gap-2">
                            <Icon name="check-circle" className="mt-0.5 size-4 shrink-0 text-accent" />
                            {note}
                        </li>
                    ))}
                </ul>

                {error && (
                    <p role="alert" className="text-sm text-error">
                        {error}
                    </p>
                )}
            </div>

            <div className="flex justify-end gap-3 border-t border-border p-5">
                <Button variant="secondary" shape="pill" disabled={isBusy} onClick={() => dialogRef.current?.close()}>
                    {texts.cancel}
                </Button>
                <Button shape="pill" disabled={isBusy} onClick={confirm}>
                    {texts.confirm(formatKzt(order.total_minor))}
                </Button>
            </div>
        </dialog>
    )
}

export default RefundOrderDialog
