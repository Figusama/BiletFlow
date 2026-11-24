import Button from '../../../components/ui/Button'
import { useLanguage } from '../../../shared/i18n/language'
import type { Application } from '../api'

interface StatusPanelProps {
    application: Application
    isWithdrawing: boolean
    error: string
    onWithdraw: () => void
}

const StatusPanel = ({ application, isWithdrawing, error, onWithdraw }: StatusPanelProps) => {
    const { t } = useLanguage()
    const text = {
        DRAFT: '',
        PENDING: t.application.pendingText,
        APPROVED: t.application.approvedText,
        REJECTED: t.application.rejectedText,
        WITHDRAWN: t.application.withdrawnText,
    }[application.status]

    return (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <p className="font-semibold text-foreground">{text}</p>
                {application.review_comment && <p className="mt-1 text-sm text-muted">{application.review_comment}</p>}
                {error && (
                    <p role="alert" className="mt-1 text-sm text-error">
                        {error}
                    </p>
                )}
            </div>

            {application.status === 'PENDING' && (
                <Button variant="secondary" shape="pill" disabled={isWithdrawing} onClick={onWithdraw}>
                    {t.application.withdraw}
                </Button>
            )}
        </div>
    )
}

export default StatusPanel
