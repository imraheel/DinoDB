import type { ReactNode } from 'react';

interface BannerProps {
  tone?: 'error' | 'success';
  children: ReactNode;
  onDismiss?(): void;
  className?: string;
}

const TONE_CLASS = {
  error: 'bg-danger-soft text-danger',
  success: 'bg-success-soft text-success'
};

export default function Banner({
  tone = 'error',
  children,
  onDismiss,
  className = ''
}: BannerProps) {
  return (
    <div className={`flex items-start gap-2 px-3 py-1.5 text-xs ${TONE_CLASS[tone]} ${className}`}>
      <span className="min-w-0 flex-1 break-words">{children}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 font-bold transition-opacity duration-100 hover:opacity-60"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
