import { useCallback, useId, useRef, useState } from 'react'
import { languageOptions, useLanguage } from '../../shared/i18n/language'
import { useDismiss } from '../../shared/lib/useDismiss'

const LanguageMenu = () => {
    const { language, setLanguage, t } = useLanguage()
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const listId = useId()

    const close = useCallback(() => setIsOpen(false), [])
    useDismiss(containerRef, isOpen, close)

    const current = languageOptions.find((option) => option.value === language)

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                aria-label={t.language.label}
                aria-expanded={isOpen}
                aria-controls={listId}
                onClick={() => setIsOpen((open) => !open)}
                className="rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap text-foreground hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
            >
                {current?.short}
            </button>

            {isOpen && (
                <ul
                    id={listId}
                    className="absolute right-0 top-full z-20 mt-2 w-40 rounded-xl border border-border bg-surface p-1.5 shadow-lg"
                >
                    {languageOptions.map(({ value, name }) => (
                        <li key={value}>
                            <button
                                type="button"
                                aria-current={value === language}
                                onClick={() => {
                                    setLanguage(value)
                                    close()
                                }}
                                className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-foreground hover:bg-accent-soft aria-[current=true]:font-semibold aria-[current=true]:text-accent"
                            >
                                {name}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

export default LanguageMenu
