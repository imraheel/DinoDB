interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm(): void | Promise<void>;
  onClose(): void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onClose
}: ConfirmDialogProps) {
  if (!open) return null;

  function handleConfirm() {
    void onConfirm();
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
        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            autoFocus
            className={
              danger
                ? 'rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700'
                : 'rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
