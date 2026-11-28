import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { simulateFeePayment } from '../features/organizer/api'
import { useLanguage } from '../shared/i18n/language'

type Outcome = 'approve' | 'decline' | 'timeout'

const FeeSimulatorPage = () => {
    const { t } = useLanguage()
    const texts = t.organizerPaidSales.simulator
    const { paymentId = '' } = useParams()
    const navigate = useNavigate()
    const [busy, setBusy] = useState<Outcome | null>(null)
    const [error, setError] = useState('')

    const finish = async (outcome: Outcome) => {
        setBusy(outcome)
        setError('')
        try {
            const paidSales = await simulateFeePayment(paymentId, outcome)
            navigate(`/organizer/events/${paidSales.event_id}/paid-sales`, { replace: true })
        } catch {
            setError(texts.failed)
            setBusy(null)
        }
    }

    return (
        <div className="mx-auto max-w-md px-4 py-16">
            <div className="rounded-2xl border border-dashed border-border-strong bg-surface p-6">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{texts.title}</h1>
                <p className="mt-2 text-sm text-muted">{texts.text}</p>
                <div className="mt-6 flex flex-col gap-3">
                    <Button shape="pill" disabled={busy !== null} onClick={() => finish('approve')}>
                        {texts.approve}
                    </Button>
                    <Button variant="secondary" shape="pill" disabled={busy !== null} onClick={() => finish('decline')}>
                        {texts.decline}
                    </Button>
                    <Button variant="secondary" shape="pill" disabled={busy !== null} onClick={() => finish('timeout')}>
                        {texts.timeout}
                    </Button>
                </div>
                {error && (
                    <p role="alert" className="mt-4 text-sm text-error">
                        {error}
                    </p>
                )}
            </div>
        </div>
    )
}

export default FeeSimulatorPage
