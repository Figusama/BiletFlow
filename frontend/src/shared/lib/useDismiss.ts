import { useEffect, type RefObject } from 'react'

export const useDismiss = (
    ref: RefObject<HTMLElement | null>,
    isOpen: boolean,
    onDismiss: () => void,
) => {
    useEffect(() => {
        if (!isOpen) return

        const handlePointerDown = (event: PointerEvent) => {
            if (event.target instanceof Node && !ref.current?.contains(event.target)) {
                onDismiss()
            }
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onDismiss()
        }

        document.addEventListener('pointerdown', handlePointerDown)
        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [ref, isOpen, onDismiss])
}
