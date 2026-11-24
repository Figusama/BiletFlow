import { useCallback, useId, useRef, useState } from 'react'
import { useLanguage } from '../../../shared/i18n/language'
import { useDismiss } from '../../../shared/lib/useDismiss'
import type { EventDetails } from '../api'
import { textButtonClass } from './chip'
import Icon from '../../../components/ui/Icon'

const itemClass = 'block px-4 py-2 text-sm text-foreground hover:bg-surface-sunk'

const CalendarMenu = ({ event }: { event: EventDetails }) => {
    const { t } = useLanguage()
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const menuId = useId()

    const close = useCallback(() => setIsOpen(false), [])
    useDismiss(containerRef, isOpen, close)

    if (!event.google_calendar_url && !event.calendar_ics_url) return null

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={menuId}
                onClick={() => setIsOpen((open) => !open)}
                className={textButtonClass}
            >
                <Icon name="calendar" className="size-4" />
                {t.eventPage.addToCalendar}
            </button>

            {isOpen && (
                <div
                    id={menuId}
                    className="absolute left-0 top-full z-20 mt-2 w-56 rounded-xl border border-border bg-surface py-1.5 shadow-md"
                >
                    {event.google_calendar_url && (
                        <a href={event.google_calendar_url} target="_blank" rel="noreferrer" onClick={close} className={itemClass}>
                            {t.eventPage.googleCalendar}
                        </a>
                    )}
                    {event.calendar_ics_url && (
                        <a href={event.calendar_ics_url} download onClick={close} className={itemClass}>
                            {t.eventPage.downloadIcs}
                        </a>
                    )}
                </div>
            )}
        </div>
    )
}

export default CalendarMenu
