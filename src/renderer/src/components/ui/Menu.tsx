import { useEffect, useRef, useLayoutEffect, type ReactNode } from 'react';
interface MenuProps {
  x: number;
  y: number;
  onClose(): void;
  className?: string;
  children: ReactNode;
}

export default function Menu({ x, y, onClose, className, children }: MenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current !== null && menuRef.current.contains(event.target as Node)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const element = menuRef.current;
    if (element === null) return;
    const rect = element.getBoundingClientRect();
    const margin = 4;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - margin) {
      left = Math.max(margin, x - rect.width);
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = Math.max(margin, y - rect.height);
    }
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className={`fixed left-0 top-0 z-[60] min-w-44 animate-menu-in rounded-menu border border-border bg-surface-raised py-1 shadow-menu ${className ?? ''}`}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  onClick,
  danger = false,
  shortcut,
  icon,
  children
}: {
  onClick(): void;
  danger?: boolean;
  shortcut?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mx-1 flex w-[calc(100%-8px)] items-center justify-between gap-6 rounded-[4px] px-2 py-[3px] text-left text-[13px] transition-colors duration-100 ${
        danger
          ? 'text-danger hover:bg-danger hover:text-white'
          : 'text-label hover:bg-accent hover:text-white'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="truncate">{children}</span>
      </span>
      {shortcut !== undefined ? (
        <span className="shrink-0 text-micro opacity-60">{shortcut}</span>
      ) : null}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="mx-2 my-1 h-px bg-border" />;
}
