import type { ReactNode } from 'react'
import EventImage from './EventImage'

interface EventBannerProps {
    image?: string
    overline: (string | null | undefined)[]
    title: string
    subtitle: (string | null | undefined)[]
    titleAs?: 'h1' | 'h2'
    children?: ReactNode
}

const BannerLine = ({ items, className }: { items: (string | null | undefined)[]; className: string }) => (
    <p className={`flex flex-wrap gap-x-4 gap-y-1 ${className}`}>
        {items.filter(Boolean).map((item) => (
            <span key={item}>{item}</span>
        ))}
    </p>
)

const EventBanner = ({ image, overline, title, subtitle, titleAs: Title = 'h2', children }: EventBannerProps) => {
    return (
        <div className="relative isolate flex min-h-[260px] items-center overflow-hidden rounded-3xl bg-night md:min-h-[340px]">
            <EventImage src={image} className="absolute inset-0 -z-20 size-full" />
            <div
                aria-hidden="true"
                className="absolute inset-0 -z-10 bg-linear-to-r from-night-deep/85 via-night-deep/45 to-transparent"
            />

            <div className="max-w-xl px-6 py-8 text-white md:px-10">
                <BannerLine items={overline} className="text-xs font-bold tracking-widest uppercase" />
                <Title className="mt-3 text-2xl leading-tight font-bold md:text-4xl">{title}</Title>
                <BannerLine items={subtitle} className="mt-3 text-sm font-semibold md:text-base" />
                {children}
            </div>
        </div>
    )
}

export default EventBanner
