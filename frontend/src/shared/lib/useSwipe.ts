import { useRef, type TouchEvent } from 'react'

const SWIPE_DISTANCE = 50

export const useSwipe = (onPrevious: () => void, onNext: () => void) => {
    const startX = useRef<number | null>(null)

    const onTouchStart = (event: TouchEvent) => {
        startX.current = event.touches[0].clientX
    }

    const onTouchEnd = (event: TouchEvent) => {
        if (startX.current === null) return

        const distance = event.changedTouches[0].clientX - startX.current
        startX.current = null

        if (Math.abs(distance) < SWIPE_DISTANCE) return
        if (distance < 0) onNext()
        else onPrevious()
    }

    return { onTouchStart, onTouchEnd }
}
