import type { Theme } from '../../app/providers/Theme'

export const themeOptions = [
    { value: 'light', icon: '/icons/sun.svg' },
    { value: 'system', icon: '/icons/desktop.svg' },
    { value: 'dark', icon: '/icons/moon.svg' },
] satisfies { value: Theme; icon: string }[]
