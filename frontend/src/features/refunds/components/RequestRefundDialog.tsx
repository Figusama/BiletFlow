import { useEffect, useRef, useState, type FormEvent } from 'react'
import Button from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import Select from '../../../components/ui/Select'
import Textarea from '../../../components/ui/Textarea'
import { ApiError } from '../../../shared/api/client'
import { useLanguage } from '../../../shared/i18n/language'
import { formatKzt } from '../../../shared/lib/money'
import { refundReasons, requestRefund, type RefundReason } from '../api'

interface RequestRefundDialogProps {
    orderId: string
    orderNumber: string
    totalMinor: number
    isFast: boolean
    onClose: (requested: boolean) => void
}

const RequestRefundDialog = ({ orderId, orderNumber, totalMinor, isFast, onClose }: RequestRefundDialogProps) => {
    const { t } = useLanguage()
    const texts = t.buyerRefund.dialog
    const dialogRef = useRef<HTMLDialogElement>(null)
    const [reason, setReason] = useState<RefundReason>('CANNOT_ATTEND')
    const [comment, setComment] = useState('')
    const [error, setError] = useState('')
    const [isBusy, setIsBusy] = useState(false)

    useEffect(() => {
        dialogRef.current?.showModal()
    }, [])

    const submit = async (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        if (reason === 'OTHER' && !comment.trim()) {
            setError(texts.commentRequired)
            return
        }
        setIsBusy(true)
        setError('')
        try {
            await requestRefund(orderId, reason, comment.trim())
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
            aria-labelledby="refund-request-title"
            className="m-auto w-[min(520px,calc(100%-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/40"
        >
            <form onSubmit={submit} noValidate>
                <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                    <div>
                        <p className="text-xs font-bold tracking-widest text-accent uppercase">{texts.eyebrow(orderNumber)}</p>
                        <h2 id="refund-request-title" className="mt-1 text-lg font-bold">
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
                        <p className="text-sm font-semibold">{texts.wholeOrder}</p>
                        <p className="text-2xl font-bold">{formatKzt(totalMinor)}</p>
                    </div>

                    <div>
                        <label htmlFor="refund-reason" className="text-sm font-medium">
                            {texts.reason}
                        </label>
                        <div id="refund-reason" className="mt-2">
                            <Select
                                fullWidth
                                ariaLabel={texts.reason}
                                value={reason}
                                options={refundReasons.map((value) => ({ value, label: texts.reasons[value] }))}
                                onValueChange={setReason}
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="refund-comment" className="text-sm font-medium">
                            {reason === 'OTHER' ? texts.commentRequiredLabel : texts.comment}
                        </label>
                        <Textarea id="refund-comment" value={comment} maxLength={2000} className="mt-2 min-h-24" onChange={(changeEvent) => setComment(changeEvent.target.value)} />
                    </div>

                    <p className="text-sm text-muted">{isFast ? texts.fastNote : texts.organizerNote}</p>

                    {error && (
                        <p role="alert" className="text-sm text-error">
                            {error}
                        </p>
                    )}
                </div>

                <div className="flex justify-end gap-3 border-t border-border p-4">
                    <Button type="button" variant="secondary" shape="pill" disabled={isBusy} onClick={() => dialogRef.current?.close()}>
                        {texts.cancel}
                    </Button>
                    <Button type="submit" shape="pill" disabled={isBusy}>
                        {texts.send}
                    </Button>
                </div>
            </form>
        </dialog>
    )
}

export default RequestRefundDialog
