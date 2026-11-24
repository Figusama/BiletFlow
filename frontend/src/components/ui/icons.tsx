interface IconProps {
    className?: string
}

export const ChevronIcon = ({ className = '' }: IconProps) => (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" preserveAspectRatio="none" className={className}>
        <path d="M14.2893 5.70708C13.8988 5.31655 13.2657 5.31655 12.8751 5.70708L7.98768 10.5993C7.20729 11.3805 7.2076 12.6463 7.98837 13.427L12.8787 18.3174C13.2693 18.7079 13.9024 18.7079 14.293 18.3174C14.6835 17.9269 14.6835 17.2937 14.293 16.9032L10.1073 12.7175C9.71678 12.327 9.71678 11.6939 10.1073 11.3033L14.2893 7.12129C14.6799 6.73077 14.6799 6.0976 14.2893 5.70708Z" />
    </svg>
)

export const ArrowIcon = ({ className = '' }: IconProps) => (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 5V19M12 5L6 11M12 5L18 11" />
    </svg>
)

const outlineProps = {
    'aria-hidden': true,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
} as const

export const CalendarIcon = ({ className = '' }: IconProps) => (
    <svg {...outlineProps} className={className}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
)

export const PinIcon = ({ className = '' }: IconProps) => (
    <svg {...outlineProps} className={className}>
        <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
        <circle cx="12" cy="9.5" r="2.5" />
    </svg>
)

export const ShareIcon = ({ className = '' }: IconProps) => (
    <svg {...outlineProps} className={className}>
        <path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
)

export const CheckCircleIcon = ({ className = '' }: IconProps) => (
    <svg {...outlineProps} className={className}>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
)

export const BellIcon = ({ className = '' }: IconProps) => (
    <svg {...outlineProps} className={className}>
        <path d="M9 21h6M18 8.6c0-1.49-.63-2.91-1.76-3.96A6.24 6.24 0 0 0 12 3c-1.59 0-3.12.59-4.24 1.64A5.39 5.39 0 0 0 6 8.6c0 2.69-.68 4.58-1.47 5.89-.77 1.26-1.16 1.89-1.15 2.05.02.19.05.25.2.36.13.1.76.1 2.02.1h12.79c1.26 0 1.89 0 2.02-.1.15-.11.18-.17.2-.36.01-.16-.37-.79-1.14-2.05C18.68 13.18 18 11.29 18 8.6Z" />
    </svg>
)

export const UserIcon = ({ className = '' }: IconProps) => (
    <svg {...outlineProps} className={className}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
)
