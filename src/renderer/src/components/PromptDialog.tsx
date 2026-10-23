import { useEffect, useState, type FormEvent } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { TextInput, LABEL_CLASS } from './ui/Input';

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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (value.trim() === '') return;
    onConfirm(value.trim());
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{ width: 300, maxWidth: '90vw' }}
      aria-label={title}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
        <h2 className="text-center text-[13px] font-semibold text-label">{title}</h2>
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>{label}</span>
          <TextInput
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onFocus={(event) => event.target.select()}
            className="w-full"
          />
        </label>
        <div className="mt-1 flex gap-2">
          <Button size="md" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={value.trim() === ''}
            className="flex-1"
          >
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
