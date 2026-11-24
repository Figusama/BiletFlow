import { useState } from 'react'
import { ShareIcon } from '../../../components/ui/icons'
import { useLanguage } from '../../../shared/i18n/language'
import { textButtonClass } from './chip'

const COPIED_MESSAGE_MS = 2000

const ShareButton = ({ title }: { title: string }) => {
    const { t } = useLanguage()
    const [copied, setCopied] = useState(false)

    const handleShare = async () => {
        const url = window.location.href

        if (navigator.share) {
            await navigator.share({ title, url }).catch(() => undefined)
            return
        }

        await navigator.clipboard.writeText(url)
        setCopied(true)
        window.setTimeout(() => setCopied(false), COPIED_MESSAGE_MS)
    }

    return (
        <button type="button" onClick={handleShare} className={textButtonClass}>
            <ShareIcon className="size-4" />
            <span aria-live="polite">{copied ? t.eventPage.linkCopied : t.eventPage.share}</span>
        </button>
    )
}

export default ShareButton
