import {
	createContext,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
	theme: Theme
	setTheme: (theme: Theme) => void
}

interface ThemeProviderProps {
	children: ReactNode
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const getSystemTheme = (): 'light' | 'dark' => {
	return window.matchMedia('(prefers-color-scheme: dark)').matches
		? 'dark'
		: 'light'
}

const ThemeProvider = ({ children }: ThemeProviderProps) => {
	const [theme, setTheme] = useState<Theme>(() => {
		const savedTheme = localStorage.getItem('theme')

		if (
			savedTheme === 'light' ||
			savedTheme === 'dark' ||
			savedTheme === 'system'
		) {
			return savedTheme
		}

		return 'system'
	})

	useEffect(() => {
		const root = document.documentElement
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

		const applyTheme = () => {
			const resolvedTheme =
				theme === 'system'
					? getSystemTheme()
					: theme

			root.dataset.theme = resolvedTheme
		}

		applyTheme()
		localStorage.setItem('theme', theme)

		if (theme === 'system') {
			mediaQuery.addEventListener('change', applyTheme)
		}

		return () => {
			mediaQuery.removeEventListener('change', applyTheme)
		}
	}, [theme])

	return (
		<ThemeContext.Provider value={{ theme, setTheme }}>
			{children}
		</ThemeContext.Provider>
	)
}

const useTheme = () => {
	const context = useContext(ThemeContext)

	if (!context) {
		throw new Error('useTheme must be used within ThemeProvider')
	}

	return context
}

export { ThemeProvider, useTheme }
export type { Theme }