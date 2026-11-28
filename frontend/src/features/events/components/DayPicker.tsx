import { getDateParts, toDayKey } from '../../../shared/lib/date'
import { useLanguage } from '../../../shared/i18n/language'

interface DayPickerProps {
    days: Date[]
    selectedDay: string | null
    daysWithEvents: Set<string>
    onSelect: (day: string | null) => void
}

const dayClass =
    'grid size-[60px] shrink-0 place-items-center content-center rounded-xl border text-center transition-colors focus-visible:outline-2 focus-visible:outline-accent'

const stateClass = (isSelected: boolean) =>
    isSelected
        ? 'border-night bg-night text-on-night'
        : 'border-border bg-surface text-foreground hover:border-border-strong'

const DayPicker = ({ days, selectedDay, daysWithEvents, onSelect }: DayPickerProps) => {
    const { t } = useLanguage()

    return (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 [mask-image:linear-gradient(to_right,black_calc(100%-40px),transparent)] [&::-webkit-scrollbar]:hidden">
            <button
                type="button"
                aria-pressed={selectedDay === null}
                onClick={() => onSelect(null)}
                className={`${dayClass} ${stateClass(selectedDay === null)} px-1.5 text-xs leading-tight font-semibold`}
            >
                {t.discover.allDates}
            </button>

            {days.map((day) => {
                const key = toDayKey(day)
                const isSelected = selectedDay === key
                const { day: dayNumber, month, weekday } = getDateParts(day)

                return (
                    <button
                        key={key}
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={`${t.dates.weekdays[weekday]}, ${dayNumber} ${t.dates.monthsGenitive[month]}`}
                        onClick={() => onSelect(key)}
                        className={`${dayClass} ${stateClass(isSelected)} ${daysWithEvents.has(key) ? '' : 'opacity-50'}`}
                    >
                        <span className="text-lg leading-none font-bold">
                            {dayNumber}
                        </span>
                        <span className={`mt-1 text-xs ${isSelected ? '' : 'text-muted'}`}>
                            {t.dates.weekdaysShort[weekday]}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}

export default DayPicker
