import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../shared/i18n/language'

interface HeaderSearchProps {
    className?: string
    onSearch?: () => void
}

const HeaderSearch = ({ className = '', onSearch }: HeaderSearchProps) => {
    const navigate = useNavigate()
    const { t } = useLanguage()

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        const query = String(new FormData(event.currentTarget).get('search') ?? '').trim()
        navigate(query ? `/?search=${encodeURIComponent(query)}` : '/')
        onSearch?.()
    }

    return (
        <form role="search" onSubmit={handleSubmit} className={className}>
            <label className="flex h-10 items-center gap-2 rounded-full bg-surface-sunk px-4 text-muted focus-within:outline-2 focus-within:outline-accent">
                <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="size-4 shrink-0"
                >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                </svg>

                <span className="sr-only">{t.nav.search}</span>
                <input
                    type="search"
                    name="search"
                    placeholder={t.nav.search}
                    className="w-full min-w-0 bg-transparent text-sm text-ellipsis text-foreground placeholder:text-muted focus:outline-none"
                />
            </label>
        </form>
    )
}

export default HeaderSearch
