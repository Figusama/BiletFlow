const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
]

export const formatRelativeTime = (iso: string, language: string) => {
    const seconds = (new Date(iso).getTime() - Date.now()) / 1000
    const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
    for (const [unit, size] of UNITS) {
        if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
    }
    return format.format(0, 'second')
}
