import { useId } from 'react'
import { useTheme, type Theme } from '../../app/providers/Theme'
import { useLanguage } from '../../shared/i18n/language'

const themeOptions = [
    { value: 'light', icon: '/icons/sun.svg' },
    { value: 'system', icon: '/icons/desktop.svg' },
    { value: 'dark', icon: '/icons/moon.svg' },
] satisfies { value: Theme; icon: string }[]

const ThemeSelect = () => {
    const { theme, setTheme } = useTheme()
    const { t } = useLanguage()
    const groupName = useId()
    const selectedIndex = themeOptions.findIndex((option) => option.value === theme)

    return (
        <fieldset className="m-0 inline-flex rounded-full border border-border bg-surface-sunk p-1">
            <legend className="sr-only">{t.theme.colorTheme}</legend>

            <div className="relative flex">
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-0 w-10 rounded-full bg-surface shadow-sm transition-[transform,background-color] duration-400 ease-out motion-reduce:transition-none"
                    style={{ transform: `translateX(${selectedIndex * 100}%)` }}
                />

                {themeOptions.map(({ value, icon }) => (
                    <label
                        key={value}
                        title={t.theme[value]}
                       	className="relative grid h-6 w-10 cursor-pointer place-items-center"
                    >
                        <input
                            type="radio"
                            name={groupName}
                            value={value}
                            checked={theme === value}
                            onChange={() => setTheme(value)}
                            className="peer sr-only"
                        />

                        <span className="grid size-full place-items-center rounded-full text-muted peer-checked:text-foreground transition-colors duration-400 ease-out motion-reduce:transition-none peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                            <span
                                aria-hidden="true"
                                className="size-5 bg-current"
                                style={{
                                    mask: `url("${icon}") center / contain no-repeat`,
                                    WebkitMask: `url("${icon}") center / contain no-repeat`,
                                }}
                            />
                        </span>

                        <span className="sr-only">{t.theme[value]}</span>
                    </label>
                ))}
            </div>
        </fieldset>
    )
}

export default ThemeSelect