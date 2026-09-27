import { useTheme, type Theme } from '../../app/providers/ThemeProvider'
import Select from './Select'

const themeOptions = [
	{ value: 'system', label: 'System' },
	{ value: 'light', label: 'Light' },
	{ value: 'dark', label: 'Dark' },
] satisfies readonly {
	value: Theme
	label: string
}[]

const ThemeSelect = () => {
	const { theme, setTheme } = useTheme()

	return (
		<Select
			value={theme}
			options={themeOptions}
			onValueChange={setTheme}
			ariaLabel="Color theme"
		/>
	)
}

export default ThemeSelect