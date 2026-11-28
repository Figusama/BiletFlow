import { useLanguage } from '../../../shared/i18n/language'
import { getDateParts } from '../../../shared/lib/date'

const notchClass = 'absolute -right-2 h-2 w-4 border-border bg-background'

interface DateStubProps {
    date: Date
    timeZone: string
}

const DateStub = ({ date, timeZone }: DateStubProps) => {
    const { t } = useLanguage()
    const { day, month, weekday } = getDateParts(date, timeZone)

    return (
        <div className="relative flex w-28 shrink-0 flex-col justify-center border-r border-dashed border-perforation pr-2 pl-4 sm:w-[140px] sm:pl-6">
            <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[28px] leading-none font-bold text-accent">{day}</span>
                <span className="text-sm font-bold text-foreground uppercase">{t.dates.weekdaysShort[weekday]}</span>
            </span>
            <span className="mt-2 text-xs font-bold tracking-wide break-words text-muted uppercase">
                {t.dates.monthsGenitive[month]}
            </span>

            <span aria-hidden="true" className={`${notchClass} -top-px rounded-b-full border border-t-0`} />
            <span aria-hidden="true" className={`${notchClass} -bottom-px rounded-t-full border border-b-0`} />
        </div>
    )
}

export default DateStub
