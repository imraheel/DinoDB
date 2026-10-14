import { useEffect, useState, type FormEvent } from 'react';

interface PromptDialogProps {
  open: boolean;
  title: string;
  label: string;
  initial?: string;
  confirmLabel?: string;
  onConfirm(value: string): void;
  onClose(): void;
}

export default function PromptDialog({
  open,
  title,
  label,
  initial = '',
  confirmLabel = 'OK',
  onConfirm,
  onClose
}: PromptDialogProps) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);

  if (!open) return null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (value.trim() === '') return;
    onConfirm(value.trim());
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={onClose}
    >
      <div
        className="w-80 rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
            <input
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onFocus={(event) => event.target.select()}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={value.trim() === ''}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
