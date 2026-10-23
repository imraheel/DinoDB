import {
  useEffect,
  useState,
  type AnimationEvent,
  type CSSProperties,
  type ReactNode
} from 'react';

interface ModalProps {
  open: boolean;
  onClose(): void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  dismissOnOverlay?: boolean;
  'aria-label'?: string;
}

export default function Modal({
  open,
  onClose,
  children,
  className = 'max-w-lg',
  style,
  dismissOnOverlay = true,
  'aria-label': ariaLabel
}: ModalProps) {
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
    } else if (rendered) {
      setClosing(true);
    }
  }, [open, rendered]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function handleOverlayAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || !closing) return;
    setClosing(false);
    setRendered(false);
  }

  if (!rendered) return null;

  return (
    <div
      role="presentation"
      onAnimationEnd={handleOverlayAnimationEnd}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[2px] ${
        closing ? 'animate-fade-out' : 'animate-fade-in'
      }`}
      onMouseDown={dismissOnOverlay ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        style={style}
        className={`relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-modal border border-border bg-surface-raised shadow-modal ${
          closing ? 'animate-modal-out' : 'animate-modal-in'
        } ${className}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({
  title,
  onClose,
  className = ''
}: {
  title: string;
  onClose?(): void;
  className?: string;
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-3 ${className}`}
    >
      <h2 className="text-[15px] font-semibold tracking-tight text-label">{title}</h2>
      {onClose ? <ModalCloseButton onClick={onClose} /> : null}
    </div>
  );
}

export function ModalCloseButton({ onClick }: { onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-label-tertiary transition-colors duration-100 hover:bg-well hover:text-label-secondary"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path
          d="M1.5 1.5l7 7M8.5 1.5l-7 7"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </button>
  );
}

export function ModalBody({
  children,
  className = ''
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`min-h-0 flex-1 overflow-y-auto px-5 py-4 ${className}`}>{children}</div>;
}

export function ModalFooter({
  children,
  className = ''
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3.5 ${className}`}
    >
      {children}
    </div>
  );
}
