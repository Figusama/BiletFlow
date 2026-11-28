import { useEffect, useState, type ReactNode } from 'react'
import { CityContext } from './city'

interface CityProviderProps {
    children: ReactNode
}

const CityProvider = ({ children }: CityProviderProps) => {
    const [city, setCity] = useState<string | null>(() => localStorage.getItem('city'))

    useEffect(() => {
        if (city) {
            localStorage.setItem('city', city)
        } else {
            localStorage.removeItem('city')
        }
    }, [city])

    return <CityContext.Provider value={{ city, setCity }}>{children}</CityContext.Provider>
}

export default CityProvider
