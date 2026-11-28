import { useCallback, useId, useRef, useState } from 'react'
import Icon from '../../../components/ui/Icon'
import { useLanguage } from '../../../shared/i18n/language'
import { useDismiss } from '../../../shared/lib/useDismiss'
import { textButtonClass } from './chip'

const COPIED_MESSAGE_MS = 2000

const itemClass = 'flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-foreground hover:bg-surface-sunk'

interface ShareButtonProps {
    title: string
    path: string
}

const ShareButton = ({ title, path }: ShareButtonProps) => {
    const { t } = useLanguage()
    const [isOpen, setIsOpen] = useState(false)
    const [copied, setCopied] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const menuId = useId()

    const close = useCallback(() => setIsOpen(false), [])
    useDismiss(containerRef, isOpen, close)

    const url = `${window.location.origin}${path}`
    const text = encodeURIComponent(`${title} ${url}`)
    const canUseSystemShare = typeof navigator.share === 'function'

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            window.setTimeout(() => setCopied(false), COPIED_MESSAGE_MS)
        } catch {
            inputRef.current?.select()
        }
    }

    const handleSystemShare = async () => {
        await navigator.share({ title, url }).catch(() => undefined)
        close()
    }

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={menuId}
                onClick={() => setIsOpen((open) => !open)}
                className={textButtonClass}
            >
                <Icon name="share" className="size-4" />
                {t.eventPage.share}
            </button>

            {isOpen && (
                <div
                    id={menuId}
                    className="absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border border-border bg-surface py-2 shadow-md"
                >
                    <div className="flex gap-2 px-3 pb-2">
                        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface-sunk px-3 text-muted">
                            <Icon name="link" className="size-3.5" />
                            <input
                                ref={inputRef}
                                readOnly
                                value={url}
                                aria-label={t.eventPage.pageLink}
                                onFocus={(event) => event.target.select()}
                                className="min-w-0 flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                            />
                        </label>
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
                        >
                            <Icon name="copy" className="size-3.5" />
                            <span aria-live="polite">{copied ? t.eventPage.linkCopied : t.eventPage.copyLink}</span>
                        </button>
                    </div>

                    <div className="border-t border-border pt-1">
                        <a href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`} target="_blank" rel="noreferrer" onClick={close} className={itemClass}>
                            <Icon name="telegram" className="size-4" />
                            Telegram
                        </a>
                        <a href={`https://wa.me/?text=${text}`} target="_blank" rel="noreferrer" onClick={close} className={itemClass}>
                            <Icon name="whatsapp" className="size-4" />
                            WhatsApp
                        </a>
                        {canUseSystemShare && (
                            <button type="button" onClick={handleSystemShare} className={itemClass}>
                                {t.eventPage.moreShareOptions}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default ShareButton
