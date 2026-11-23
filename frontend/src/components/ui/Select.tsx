import * as RadixSelect from '@radix-ui/react-select'

interface SelectOption<T extends string> {
	value: T
	label: string
}

interface SelectProps<T extends string> {
	value: T
	options: readonly SelectOption<T>[]
	onValueChange: (value: T) => void
	placeholder?: string
	ariaLabel?: string
}

const Select = <T extends string>({
	value,
	options,
	onValueChange,
	placeholder,
	ariaLabel,
}: SelectProps<T>) => {
    const handleValueChange = (value: string) => {
		const selectedOption = options.find(
			(option) => option.value === value,
		)

		if (selectedOption) {
			onValueChange(selectedOption.value)
		}
	}

	return (
		<RadixSelect.Root
			value={value}
			onValueChange={handleValueChange}
		>
			<RadixSelect.Trigger
				aria-label={ariaLabel}
				className="
					inline-flex h-9 items-center justify-between gap-2
					rounded-lg border border-border
					bg-surface px-3
					text-sm text-foreground
					outline-none
					transition-colors
					hover:bg-surface-sunk
					focus-visible:ring-2
					focus-visible:ring-accent
				"
			>
				<RadixSelect.Value placeholder={placeholder} />

				<RadixSelect.Icon
					className="text-muted"
					aria-hidden="true"
				>
					⌄
				</RadixSelect.Icon>
			</RadixSelect.Trigger>

			<RadixSelect.Portal>
				<RadixSelect.Content
					position="popper"
					sideOffset={6}
					className="
						z-50 min-w-[var(--radix-select-trigger-width)]
						overflow-hidden rounded-lg
						border border-border
						bg-surface-sunk p-1
						shadow-lg
					"
				>
					<RadixSelect.Viewport>
						{options.map((option) => (
							<RadixSelect.Item
								key={option.value}
								value={option.value}
								className="
									relative flex cursor-pointer select-none
									items-center rounded-md
									px-3 py-2 pr-8
									text-sm text-foreground
									outline-none
									data-[highlighted]:bg-surface
									data-[highlighted]:text-foreground
									data-[state=checked]:text-accent
								"
							>
								<RadixSelect.ItemText>
									{option.label}
								</RadixSelect.ItemText>

								<RadixSelect.ItemIndicator className="absolute right-3">
									✓
								</RadixSelect.ItemIndicator>
							</RadixSelect.Item>
						))}
					</RadixSelect.Viewport>
				</RadixSelect.Content>
			</RadixSelect.Portal>
		</RadixSelect.Root>
	)
}

export default Select