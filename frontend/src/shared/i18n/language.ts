import { createContext, useContext } from 'react'
import { en, type Dictionary } from './dictionaries/en'
import { kk } from './dictionaries/kk'
import { ru } from './dictionaries/ru'

export type Language = 'kk' | 'ru' | 'en'

export const DEFAULT_LANGUAGE: Language = 'en'

export const dictionaries: Record<Language, Dictionary> = { kk, ru, en }

export const languageOptions: { value: Language; short: string; name: string }[] = [
    { value: 'kk', short: 'KZ', name: 'Қазақша' },
    { value: 'ru', short: 'RU', name: 'Русский' },
    { value: 'en', short: 'EN', name: 'English' },
]

export const isLanguage = (value: unknown): value is Language =>
    value === 'kk' || value === 'ru' || value === 'en'

export interface LanguageContextValue {
    language: Language
    setLanguage: (language: Language) => void
    t: Dictionary
}

export const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

export const useLanguage = () => {
    const context = useContext(LanguageContext)

    if (!context) {
        throw new Error('useLanguage must be used within LanguageProvider')
    }

    return context
}
