interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentedControlOption<T>[];
  onChange(value: T): void;
  ariaLabel?: string;
  className?: string;
}

export default function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = ''
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex gap-[2px] rounded-[7px] border border-border bg-well p-[2px] ${className}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`min-w-16 flex-1 rounded-[5px] px-3 py-[3px] text-xs ${
              selected
                ? 'bg-surface-raised font-medium text-label shadow-raise'
                : 'text-label-secondary hover:text-label'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
