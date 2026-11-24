import { useEffect, useState } from 'react'
import { useLanguage } from '../../../shared/i18n/language'
import { fetchTicketFile } from '../api'

const boxClass = 'grid aspect-square w-full place-items-center rounded-xl bg-white p-2'

const TicketQr = ({ ticketId }: { ticketId: string }) => {
    const { t } = useLanguage()
    const [url, setUrl] = useState<string | null>(null)
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        let objectUrl: string | null = null
        let isActive = true

        fetchTicketFile(ticketId, 'qr.png')
            .then((blob) => {
                if (!isActive) return
                objectUrl = URL.createObjectURL(blob)
                setUrl(objectUrl)
            })
            .catch(() => isActive && setFailed(true))

        return () => {
            isActive = false
            if (objectUrl) URL.revokeObjectURL(objectUrl)
        }
    }, [ticketId])

    if (failed) {
        return <div className={`${boxClass} text-center text-xs text-muted`}>{t.ticketsPage.qrFailed}</div>
    }

    if (!url) {
        return <div className={`${boxClass} animate-pulse`} />
    }

    return (
        <div className={boxClass}>
            <img src={url} alt={t.ticketsPage.qrAlt} className="block size-full object-contain" />
        </div>
    )
}

export default TicketQr
