import { useEffect, useState } from 'react'

export const useSecondsLeft = (deadline: string | undefined) => {
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(timer)
    }, [])

    if (!deadline) return null
    return Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000))
}

export const formatSeconds = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const rest = String(seconds % 60).padStart(2, '0')
    return `${minutes}:${rest}`
}
