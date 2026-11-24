import type { Dictionary } from '../../shared/i18n/dictionaries/en'

export const mainLinks: { to: string; labelKey: keyof Dictionary['nav'] }[] = [
    { to: '/', labelKey: 'discover' },
    { to: '/tickets', labelKey: 'myTickets' },
]

export const organizerLinks: { to: string; labelKey: keyof Dictionary['organizer'] }[] = [
    { to: '/organizer/events/new', labelKey: 'createEvent' },
    { to: '/organizer/events', labelKey: 'myEvents' },
    { to: '/organizer/help', labelKey: 'help' },
]

export const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap text-foreground transition-colors
     hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent
     ${isActive ? 'bg-accent-soft' : ''}`
