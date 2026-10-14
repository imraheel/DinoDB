interface ToggleProps {
  checked: boolean;
  onChange(checked: boolean): void;
  'aria-label'?: string;
}

export default function Toggle({ checked, onChange, 'aria-label': ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-150 ${
        checked ? 'bg-accent' : 'bg-border-strong'
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-raise transition-transform duration-150 ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  );
}
