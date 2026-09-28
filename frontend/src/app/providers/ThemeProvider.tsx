import {
	useEffect,
	useState,
	type ReactNode,
} from 'react'

import { ThemeContext, type Theme } from './Theme'

interface ThemeProviderProps {
	children: ReactNode
}

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

export default ThemeProvider