import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'default' | 'quiet' | 'destructive';
export type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pill?: boolean;
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'h-[22px] px-2.5 text-xs',
  md: 'h-7 px-3.5 text-xs'
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-accent-hover active:bg-accent-active active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.25)]',
  default: 'button-neutral',
  quiet:
    'text-label-secondary hover:bg-well hover:text-label active:bg-[rgba(0,0,0,0.08)] dark:active:bg-[rgba(255,255,255,0.12)]',
  destructive:
    'bg-danger text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-danger-hover active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.25)]'
};

export default function Button({
  variant = 'default',
  size = 'md',
  pill = false,
  className = '',
  type = 'button',
  disabled = false,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex shrink-0 select-none items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-colors duration-100 disabled:pointer-events-none disabled:opacity-40 ${
        pill ? 'rounded-full' : 'rounded-control'
      } ${SIZE_CLASS[size]} ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    />
  );
}
