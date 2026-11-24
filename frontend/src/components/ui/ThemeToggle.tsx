import { useTheme } from '../../app/providers/Theme'
import { useLanguage } from '../../shared/i18n/language'
import { themeOptions } from './themeOptions'

const ThemeToggle = () => {
    const { theme, setTheme } = useTheme()
    const { t } = useLanguage()
    const index = themeOptions.findIndex((option) => option.value === theme)
    const current = themeOptions[index]
    const next = themeOptions[(index + 1) % themeOptions.length]

    return (
        <button
            type="button"
            onClick={() => setTheme(next.value)}
            aria-label={`${t.theme.colorTheme}: ${t.theme[current.value]}`}
            title={t.theme[current.value]}
            className="grid size-10 shrink-0 place-items-center rounded-full text-foreground hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
        >
            <span
                aria-hidden="true"
                className="size-5 bg-current"
                style={{
                    mask: `url("${current.icon}") center / contain no-repeat`,
                    WebkitMask: `url("${current.icon}") center / contain no-repeat`,
                }}
            />
        </button>
    )
}

export default ThemeToggle
