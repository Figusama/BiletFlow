export type IconName =
    | 'arrow-up'
    | 'ban'
    | 'bell'
    | 'calendar'
    | 'check-circle'
    | 'chevron-left'
    | 'clock'
    | 'close'
    | 'copy'
    | 'desktop'
    | 'download'
    | 'link'
    | 'menu'
    | 'minus'
    | 'moon'
    | 'pause'
    | 'plus'
    | 'search'
    | 'share'
    | 'sun'
    | 'telegram'
    | 'whatsapp'
    | 'x-circle'

interface IconProps {
    name: IconName
    className?: string
}

const Icon = ({ name, className = 'size-5' }: IconProps) => {
    const mask = `url("/icons/${name}.svg") center / contain no-repeat`

    return (
        <span
            aria-hidden="true"
            className={`inline-block shrink-0 bg-current ${className}`}
            style={{ mask, WebkitMask: mask }}
        />
    )
}

export default Icon
