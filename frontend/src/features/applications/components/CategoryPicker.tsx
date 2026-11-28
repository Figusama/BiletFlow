import type { Category } from '../api'

interface CategoryPickerProps {
    categories: Category[]
    selectedIds: string[]
    onChange: (ids: string[]) => void
}

const CategoryPicker = ({ categories, selectedIds, onChange }: CategoryPickerProps) => {
    const toggle = (id: string) =>
        onChange(selectedIds.includes(id) ? selectedIds.filter((selected) => selected !== id) : [...selectedIds, id])

    return (
        <div className="flex flex-wrap gap-2">
            {categories.map((category) => {
                const isSelected = selectedIds.includes(category.id)
                return (
                    <button
                        key={category.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggle(category.id)}
                        className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:cursor-default ${isSelected ? 'border-accent bg-accent-soft text-accent' : 'border-border text-foreground hover:border-border-strong'}`}
                    >
                        {category.name}
                    </button>
                )
            })}
        </div>
    )
}

export default CategoryPicker
