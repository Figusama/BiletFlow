import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../../components/ui/Button'
import { useLanguage } from '../../../shared/i18n/language'
import { duplicateEvent, type ManagedEvent } from '../api'

const DuplicateEventCard = ({ event }: { event: ManagedEvent }) => {
    const { t } = useLanguage()
    const texts = t.organizerDuplicate
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState('')

    const duplicate = async () => {
        setIsBusy(true)
        setError('')
        try {
            const draft = await duplicateEvent(event.id)
            await queryClient.invalidateQueries({ queryKey: ['applications'] })
            navigate(`/organizer/applications/${draft.id}`)
        } catch {
            setError(texts.failed)
            setIsBusy(false)
        }
    }

    return (
        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-bold text-foreground">{texts.title}</h2>
            <p className="mt-2 text-sm text-muted">{texts.text}</p>
            <p className="mt-1 text-sm text-muted">{texts.notCopied}</p>
            <Button className="mt-4" variant="secondary" shape="pill" disabled={isBusy} onClick={duplicate}>
                {isBusy ? texts.creating : texts.button}
            </Button>
            {error && (
                <p role="alert" className="mt-3 text-sm text-error">
                    {error}
                </p>
            )}
        </section>
    )
}

export default DuplicateEventCard
