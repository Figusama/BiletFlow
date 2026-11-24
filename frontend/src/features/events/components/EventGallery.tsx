import { useState } from 'react'
import { useLanguage } from '../../../shared/i18n/language'
import { useSwipe } from '../../../shared/lib/useSwipe'
import EventImage from './EventImage'
import Icon from '../../../components/ui/Icon'

interface EventGalleryProps {
    images: string[]
    title: string
    className?: string
}

const arrowClass =
    'absolute top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-night-deep/60 text-white backdrop-blur hover:bg-night-deep/80 focus-visible:outline-2 focus-visible:outline-white md:grid'

const EventGallery = ({ images, title, className = '' }: EventGalleryProps) => {
    const { t } = useLanguage()
    const [index, setIndex] = useState(0)
    const goTo = (next: number) => setIndex((next + images.length) % images.length)
    const swipe = useSwipe(() => goTo(index - 1), () => goTo(index + 1))

    if (images.length <= 1) {
        return <EventImage src={images[0]} className={`w-full rounded-3xl ${className}`} />
    }

    return (
        <section
            aria-roledescription="carousel"
            aria-label={title}
            {...swipe}
            className={`relative touch-pan-y overflow-hidden rounded-3xl ${className}`}
        >
            <EventImage src={images[index]} className="size-full" />

            <button type="button" aria-label={t.eventPage.previousPhoto} onClick={() => goTo(index - 1)} className={`${arrowClass} left-4`}>
                <Icon name="chevron-left" className="size-5" />
            </button>
            <button type="button" aria-label={t.eventPage.nextPhoto} onClick={() => goTo(index + 1)} className={`${arrowClass} right-4`}>
                <Icon name="chevron-left" className="size-5 rotate-180" />
            </button>

            <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
                {images.map((image, dotIndex) => (
                    <button
                        key={image}
                        type="button"
                        aria-label={t.eventPage.showPhoto(dotIndex + 1)}
                        aria-current={dotIndex === index}
                        onClick={() => goTo(dotIndex)}
                        className="h-1.5 w-1.5 rounded-full bg-white/60 transition-all aria-[current=true]:w-6 aria-[current=true]:bg-white"
                    />
                ))}
            </div>
        </section>
    )
}

export default EventGallery
