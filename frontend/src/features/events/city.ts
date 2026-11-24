import { createContext, useContext } from 'react'

export interface CityContextValue {
    city: string | null
    setCity: (city: string | null) => void
}

export const CityContext = createContext<CityContextValue | undefined>(undefined)

export const useCity = () => {
    const context = useContext(CityContext)

    if (!context) {
        throw new Error('useCity must be used within CityProvider')
    }

    return context
}
