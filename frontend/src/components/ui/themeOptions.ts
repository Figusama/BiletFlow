import type { Theme } from '../../app/providers/Theme'
import type { IconName } from './Icon'

export const themeOptions = [
    { value: 'light', icon: 'sun' },
    { value: 'system', icon: 'desktop' },
    { value: 'dark', icon: 'moon' },
] satisfies { value: Theme; icon: IconName }[]
