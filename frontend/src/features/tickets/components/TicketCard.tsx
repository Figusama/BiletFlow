import { useState } from 'react'
import { useLanguage } from '../../../shared/i18n/language'
import { fetchTicketFile, type Ticket } from '../api'
import TicketQr from './TicketQr'
import TicketStatusBadge from './TicketStatusBadge'

const Fact = ({ label, value }: { label: string; value: string }) => (
    <div>
        <dt className="text-[11px] font-bold tracking-widest text-muted uppercase">{label}</dt>
        <dd className="mt-0.5 font-bold text-accent">{value}</dd>
    </div>
)

const TicketCard = ({ ticket }: { ticket: Ticket }) => {
    const { t } = useLanguage()
    const [isDownloading, setIsDownloading] = useState(false)
    const [downloadFailed, setDownloadFailed] = useState(false)
    const isValid = ticket.status === 'VALID'

    const handleDownload = async () => {
        setIsDownloading(true)
        setDownloadFailed(false)
        try {
            const blob = await fetchTicketFile(ticket.id, 'pdf')
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `ticket-${ticket.public_id}.pdf`
            link.click()
            window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        } catch {
            setDownloadFailed(true)
        } finally {
            setIsDownloading(false)
        }
    }

    return (
        <article className="flex overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <TicketStatusBadge status={ticket.status} />
                    <span className="font-mono text-xs text-muted">{ticket.public_id}</span>
                </div>

                <p className="text-lg font-bold break-words text-foreground">{ticket.attendee_name}</p>

                <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <Fact label={t.ticketsPage.type} value={ticket.ticket_type_name} />
                    {ticket.seat_label && <Fact label={t.ticketsPage.seat} value={ticket.seat_label} />}
                </dl>

                {isValid && (
                    <button
                        type="button"
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="mt-auto self-start text-sm font-semibold text-accent hover:underline disabled:opacity-60"
                    >
                        {isDownloading ? t.ticketsPage.downloading : t.ticketsPage.downloadPdf}
                    </button>
                )}
                {downloadFailed && (
                    <p role="alert" className="text-sm text-error">
                        {t.ticketsPage.downloadFailed}
                    </p>
                )}
            </div>

            {isValid && (
                <div className="flex w-32 shrink-0 items-center border-l-2 border-dashed border-on-night/30 bg-night p-4 sm:w-40">
                    <TicketQr ticketId={ticket.id} />
                </div>
            )}
        </article>
    )
}

export default TicketCard
