import { useLanguage } from '../../../shared/i18n/language'
import type { EventCategory } from '../api'
import type { EventFilters } from '../filters'
import { chipClass } from './chip'

interface EventFiltersBarProps {
    categories: EventCategory[]
    filters: EventFilters
    onChange: (changes: Partial<EventFilters>) => void
}

const priceInputClass =
    'w-24 border-b border-border-strong bg-transparent px-1 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none'

const EventFiltersBar = ({ categories, filters, onChange }: EventFiltersBarProps) => {
    const { t } = useLanguage()
    const labels: Record<string, string> = t.categories

    const toggleCategory = (slug: string) => {
        const selected = filters.categories.includes(slug)
            ? filters.categories.filter((item) => item !== slug)
            : [...filters.categories, slug]
        onChange({ categories: selected })
    }

    return (
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:gap-6">
            {categories.length > 0 && (
                <div role="group" aria-label={t.discover.categoriesLabel} className="flex min-w-0 flex-1 flex-wrap gap-2">
                    <button
                        type="button"
                        aria-pressed={filters.categories.length === 0}
                        onClick={() => onChange({ categories: [] })}
                        className={chipClass(filters.categories.length === 0)}
                    >
                        {t.discover.allCategories}
                    </button>
    
                    {categories.map(({ slug, name }) => (
                        <button
                            key={slug}
                            type="button"
                            aria-pressed={filters.categories.includes(slug)}
                            onClick={() => toggleCategory(slug)}
                            className={chipClass(filters.categories.includes(slug))}
                        >
                            {labels[slug] ?? name}
                        </button>
                    ))}
                </div>
            )}

            <div className="flex shrink-0 flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-muted">{t.discover.price}</span>

                <div className="flex h-9 items-center gap-3 rounded-full border border-border-strong bg-surface px-4">
                    <label className="flex items-center gap-2 text-sm text-muted">
                        {t.discover.priceMin}
                        <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={filters.minPrice}
                            onChange={(event) => onChange({ minPrice: event.target.value })}
                            className={priceInputClass}
                        />
                    </label>
                    <span aria-hidden="true" className="h-6 w-px bg-border" />
                    <label className="flex items-center gap-2 text-sm text-muted">
                        {t.discover.priceMax}
                        <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={filters.maxPrice}
                            onChange={(event) => onChange({ maxPrice: event.target.value })}
                            className={priceInputClass}
                        />
                    </label>
                </div>

                <button
                    type="button"
                    aria-pressed={filters.freeOnly}
                    onClick={() => onChange({ freeOnly: !filters.freeOnly })}
                    className={chipClass(filters.freeOnly)}
                >
                    {t.discover.free}
                </button>
            </div>
        </div>
    )
}

export default EventFiltersBar
