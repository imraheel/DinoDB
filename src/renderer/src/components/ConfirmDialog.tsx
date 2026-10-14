import Modal from './ui/Modal';
import Button from './ui/Button';

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
  function handleConfirm() {
    void onConfirm();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{ width: 280, maxWidth: '90vw' }}
      aria-label={title}
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="text-center">
          <h2 className="text-[13px] font-semibold text-label">{title}</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-label-secondary">{message}</p>
        </div>
        <div className="mt-1 flex gap-2">
          <Button size="md" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'destructive' : 'primary'}
            size="md"
            autoFocus
            className="flex-1"
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
