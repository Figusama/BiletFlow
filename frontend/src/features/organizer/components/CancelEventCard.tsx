import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Button from '../../../components/ui/Button'
import FormField from '../../../components/ui/FormField'
import Textarea from '../../../components/ui/Textarea'
import { ApiError } from '../../../shared/api/client'
import { useLanguage } from '../../../shared/i18n/language'
import {
    cancelEvent,
    cancellationsKey,
    managedEventKey,
    requestCancellation,
    useCancellationRequests,
    withdrawCancellation,
    type ManagedEvent,
} from '../api'

type Step = 'closed' | 'form' | 'needsRequest'

const CancelEventCard = ({ event }: { event: ManagedEvent }) => {
    const { t } = useLanguage()
    const texts = t.organizerCancel
    const queryClient = useQueryClient()
    const { data: requests = [] } = useCancellationRequests(event.id)
    const [step, setStep] = useState<Step>('closed')
    const [reason, setReason] = useState('')
    const [confirmed, setConfirmed] = useState(false)
    const [showErrors, setShowErrors] = useState(false)
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')

    const pending = requests.find((request) => request.status === 'PENDING')
    const latest = requests[0]
    const reasonError = reason.trim().length < 3 ? texts.reasonRequired : ''
    const confirmError = confirmed ? '' : texts.confirmRequired

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: cancellationsKey(event.id) })
        queryClient.invalidateQueries({ queryKey: managedEventKey(event.id) })
        queryClient.invalidateQueries({ queryKey: ['events'] })
    }

    const run = async (task: () => Promise<unknown>, onConflict?: () => void) => {
        setIsBusy(true)
        setError('')
        try {
            await task()
            setStep('closed')
            refresh()
        } catch (caught) {
            if (onConflict && caught instanceof ApiError && caught.status === 409) onConflict()
            else setError(texts.failed)
        }
        setIsBusy(false)
    }

    const handleCancel = () => {
        if (reasonError || confirmError) {
            setShowErrors(true)
            return
        }
        run(
            () => cancelEvent(event.id, reason.trim()),
            event.status === 'PUBLISHED' ? () => setStep('needsRequest') : undefined,
        )
    }

    if (pending) {
        return (
            <section className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="font-semibold text-foreground">{texts.pendingTitle}</p>
                    <p className="mt-1 text-sm text-muted">{texts.pendingText}</p>
                    {error && <p className="mt-1 text-sm text-error">{error}</p>}
                </div>
                <Button variant="secondary" shape="pill" disabled={isBusy} onClick={() => run(() => withdrawCancellation(event.id, pending.id))}>
                    {texts.withdraw}
                </Button>
            </section>
        )
    }

    return (
        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-bold text-foreground">{texts.title}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">{texts.text}</p>
            {latest?.status === 'REJECTED' && latest.review_comment && (
                <p className="mt-2 text-sm text-foreground">{texts.rejected(latest.review_comment)}</p>
            )}

            {step === 'closed' && (
                <button
                    type="button"
                    onClick={() => setStep('form')}
                    className="mt-4 inline-flex h-10 items-center rounded-full border border-danger/40 px-5 text-sm font-semibold text-danger hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
                >
                    {texts.open}
                </button>
            )}

            {step !== 'closed' && (
                <div className="mt-5 flex flex-col gap-4">
                    <FormField label={texts.reason} htmlFor="cancel-reason" hint={texts.reasonHint} error={showErrors ? reasonError : undefined}>
                        <Textarea
                            id="cancel-reason"
                            value={reason}
                            maxLength={2000}
                            className="min-h-20"
                            hasError={showErrors && Boolean(reasonError)}
                            disabled={step === 'needsRequest'}
                            onChange={(changeEvent) => setReason(changeEvent.target.value)}
                        />
                    </FormField>

                    {step === 'form' ? (
                        <>
                            <div>
                                <label className="flex cursor-pointer items-start gap-3">
                                    <input
                                        type="checkbox"
                                        checked={confirmed}
                                        onChange={(changeEvent) => setConfirmed(changeEvent.target.checked)}
                                        className="mt-0.5 size-5 shrink-0 accent-accent"
                                    />
                                    <span className="text-sm text-foreground">{texts.confirm}</span>
                                </label>
                                {showErrors && confirmError && <p className="mt-2 text-sm text-error">{confirmError}</p>}
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={handleCancel}
                                    className="inline-flex h-11 items-center rounded-full bg-danger px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
                                >
                                    {isBusy ? texts.cancelling : texts.cancel}
                                </button>
                                <Button variant="secondary" shape="pill" disabled={isBusy} onClick={() => setStep('closed')}>
                                    {texts.keep}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="rounded-2xl bg-warning-soft p-4 text-sm text-foreground">{texts.ticketsIssued}</p>
                            <div className="flex flex-wrap gap-3">
                                <Button shape="pill" disabled={isBusy} onClick={() => run(() => requestCancellation(event.id, reason.trim()))}>
                                    {isBusy ? texts.sending : texts.sendRequest}
                                </Button>
                                <Button variant="secondary" shape="pill" disabled={isBusy} onClick={() => setStep('closed')}>
                                    {texts.keep}
                                </Button>
                            </div>
                        </>
                    )}

                    {error && (
                        <p role="alert" className="text-sm text-error">
                            {error}
                        </p>
                    )}
                </div>
            )}
        </section>
    )
}

export default CancelEventCard
