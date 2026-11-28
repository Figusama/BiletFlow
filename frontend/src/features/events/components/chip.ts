export const chipClass = (isActive: boolean) =>
    `inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
        isActive
            ? 'border-accent-soft bg-accent-soft text-foreground'
            : 'border-border bg-surface text-foreground hover:border-border-strong'
    }`

export const textButtonClass =
    'inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium text-foreground hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent'
