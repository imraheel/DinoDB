import type { InputHTMLAttributes, ReactNode } from 'react';

export const BASE_INPUT_CLASS =
  'rounded-field border border-border-strong bg-surface px-2 h-[26px] text-label shadow-[inset_0_1px_1px_rgba(0,0,0,0.04)] placeholder:text-label-tertiary focus:border-accent focus:ring-2 focus:ring-accent-ring outline-none disabled:opacity-50';

export const LABEL_CLASS = 'mb-1 block text-xs font-medium text-label-secondary';

export const FRAME_CLASS =
  'rounded-field border border-border-strong bg-surface overflow-hidden shadow-[inset_0_1px_1px_rgba(0,0,0,0.04)]';

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
}

export function TextInput({ className = '', label, hint, id, ...rest }: TextInputProps) {
  const input = (
    <input id={id} className={`${BASE_INPUT_CLASS} ${className}`} {...rest} />
  );
  if (label === undefined) return input;
  return (
    <label className="flex flex-col gap-1" htmlFor={id}>
      <span className={LABEL_CLASS}>{label}</span>
      {input}
      {hint}
    </label>
  );
}
