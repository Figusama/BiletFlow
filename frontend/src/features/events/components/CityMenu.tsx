import { useCallback, useId, useRef, useState } from 'react'
import { useLanguage } from '../../../shared/i18n/language'
import { useDismiss } from '../../../shared/lib/useDismiss'
import { useEvents } from '../api'
import { useCity } from '../city'
import { getCities } from '../filters'

const CityMenu = () => {
    const { t } = useLanguage()
    const { city, setCity } = useCity()
    const { data: events = [] } = useEvents()
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const listId = useId()

    const close = useCallback(() => setIsOpen(false), [])
    useDismiss(containerRef, isOpen, close)

    const cityName = (name: string) => t.city.names[name] ?? name
    const options: { value: string | null; label: string }[] = [
        { value: null, label: t.city.all },
        ...getCities(events).map((name) => ({ value: name, label: cityName(name) })),
    ]

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                aria-label={t.city.label}
                aria-expanded={isOpen}
                aria-controls={listId}
                onClick={() => setIsOpen((open) => !open)}
                className="max-w-36 truncate rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap text-foreground hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
            >
                {city ? cityName(city) : t.city.all}
            </button>

            {isOpen && (
                <ul
                    id={listId}
                    className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border border-border bg-surface p-1.5 shadow-lg"
                >
                    {options.map(({ value, label }) => (
                        <li key={value ?? 'all'}>
                            <button
                                type="button"
                                aria-current={value === city}
                                onClick={() => {
                                    setCity(value)
                                    close()
                                }}
                                className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-foreground hover:bg-accent-soft aria-[current=true]:font-semibold aria-[current=true]:text-accent"
                            >
                                {label}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

export default CityMenu
