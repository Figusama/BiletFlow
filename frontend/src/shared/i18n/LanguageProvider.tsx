import { useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_LANGUAGE, LanguageContext, dictionaries, isLanguage, type Language } from './language'

interface LanguageProviderProps {
    children: ReactNode
}

const LanguageProvider = ({ children }: LanguageProviderProps) => {
    const [language, setLanguage] = useState<Language>(() => {
        const savedLanguage = localStorage.getItem('language')
        return isLanguage(savedLanguage) ? savedLanguage : DEFAULT_LANGUAGE
    })

    useEffect(() => {
        localStorage.setItem('language', language)
        document.documentElement.lang = language
    }, [language])

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t: dictionaries[language] }}>
            {children}
        </LanguageContext.Provider>
    )
}

export default LanguageProvider
