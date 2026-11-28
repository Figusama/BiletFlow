interface EventImageProps {
    src?: string
    className?: string
}

const EventImage = ({ src, className = '' }: EventImageProps) => {
    if (!src) {
        return <div aria-hidden="true" className={`bg-linear-to-br from-accent to-night ${className}`} />
    }

    return <img src={src} alt="" className={`object-cover ${className}`} />
}

export default EventImage
