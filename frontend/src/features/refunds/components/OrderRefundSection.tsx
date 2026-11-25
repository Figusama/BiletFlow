import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../../components/ui/Button'
import { ApiError } from '../../../shared/api/client'
import { useLanguage } from '../../../shared/i18n/language'
import { APP_TIME_ZONE } from '../../../shared/lib/date'
import { formatKzt } from '../../../shared/lib/money'
import { formatDateTime } from '../../organizer/changes'
import { orderRefundKey, requestSpecialRefund, useOrderRefundRequests, useRefundEligibility, withdrawRefund, type BuyerRefundRequest } from '../api'
import RequestRefundDialog from './RequestRefundDialog'

interface OrderRefundSectionProps {
    orderId: string
    orderNumber: string
    totalMinor: number
}

const OrderRefundSection = ({ orderId, orderNumber, totalMinor }: OrderRefundSectionProps) => {
    const { t } = useLanguage()
    const texts = t.buyerRefund
    const queryClient = useQueryClient()
    const { data: requests, isPending: requestsPending } = useOrderRefundRequests(orderId, true)
    const { data: eligibility, isPending: eligibilityPending } = useRefundEligibility(orderId, true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')

    if (requestsPending || eligibilityPending) return <div className="mt-8 h-24 max-w-2xl animate-pulse rounded-2xl bg-surface-sunk" />

    const latest: BuyerRefundRequest | undefined = (requests ?? []).find((request) => request.status !== 'WITHDRAWN')
    const isActive = latest !== undefined && latest.status !== 'REJECTED'
    const refresh = () => queryClient.invalidateQueries({ queryKey: orderRefundKey(orderId) })

    const run = async (action: () => Promise<unknown>, conflictText: string) => {
        setIsBusy(true)
        setError('')
        try {
            await action()
            await refresh()
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 409 ? conflictText : texts.failed)
        } finally {
            setIsBusy(false)
        }
    }

    const statusText = (request: BuyerRefundRequest) => {
        switch (request.status) {
            case 'PENDING':
                return request.escalates_at ? `${texts.status.PENDING} ${texts.escalation(formatDateTime(request.escalates_at, APP_TIME_ZONE, t))}` : texts.status.PENDING
            case 'PENDING_ADMIN':
                return texts.status.PENDING_ADMIN
            case 'APPROVED':
                return texts.execution[request.execution_status ?? 'NOT_STARTED'](formatKzt(request.amount_minor))
            case 'REJECTED':
                return texts.status.REJECTED
            default:
                return ''
        }
    }

    const reasonText = (reason: string | null) => (reason && texts.reasons[reason]) || texts.notAvailable
    const showSpecial =
        eligibility &&
        !eligibility.eligible &&
        !isActive &&
        eligibility.reason !== 'Event is cancelled; refund is issued automatically' &&
        eligibility.reason !== 'Order is already refunded'

    return (
        <section aria-labelledby="order-refund-title" className="mt-8 max-w-2xl rounded-2xl border border-border bg-surface p-5">
            <h2 id="order-refund-title" className="text-lg font-bold text-foreground">
                {texts.title}
            </h2>

            {latest && (
                <p role="status" className="mt-3 text-sm text-foreground">
                    {statusText(latest)}
                </p>
            )}

            {latest && (latest.status === 'PENDING' || latest.status === 'PENDING_ADMIN') && latest.source === 'CUSTOMER' && (
                <Button className="mt-4" variant="secondary" shape="pill" disabled={isBusy} onClick={() => run(() => withdrawRefund(latest.id), texts.withdrawConflict)}>
                    {texts.withdraw}
                </Button>
            )}

            {!isActive && eligibility?.eligible && (
                <>
                    <p className="mt-3 text-sm text-muted">
                        {eligibility.fast_refund
                            ? texts.fastAvailable
                            : eligibility.deadline
                              ? texts.until(formatDateTime(eligibility.deadline, APP_TIME_ZONE, t))
                              : texts.available}
                    </p>
                    <Button className="mt-4" shape="pill" disabled={isBusy} onClick={() => setIsDialogOpen(true)}>
                        {texts.request}
                    </Button>
                </>
            )}

            {!isActive && eligibility && !eligibility.eligible && (
                <>
                    <p className="mt-3 text-sm text-muted">{reasonText(eligibility.reason)}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-4">
                        {showSpecial && (
                            <Button variant="secondary" shape="pill" disabled={isBusy} onClick={() => run(() => requestSpecialRefund(orderId), texts.noSpecialWindow)}>
                                {texts.special}
                            </Button>
                        )}
                        <Link to={`/support/new?orderId=${orderId}`} className="text-sm font-semibold text-accent hover:underline">
                            {texts.contactSupport}
                        </Link>
                    </div>
                </>
            )}

            {error && (
                <p role="alert" className="mt-3 text-sm text-error">
                    {error}
                </p>
            )}

            {isDialogOpen && (
                <RequestRefundDialog
                    orderId={orderId}
                    orderNumber={orderNumber}
                    totalMinor={totalMinor}
                    isFast={Boolean(eligibility?.fast_refund)}
                    onClose={(requested) => {
                        setIsDialogOpen(false)
                        if (requested) void refresh()
                    }}
                />
            )}
        </section>
    )
}

export default OrderRefundSection
