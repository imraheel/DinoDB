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
  /** Optional second required field, e.g. the first collection of a new database. */
  secondLabel?: string;
  secondInitial?: string;
  onConfirm(value: string, second: string): void;
  onClose(): void;
}

export default function PromptDialog({
  open,
  title,
  label,
  initial = '',
  confirmLabel = 'OK',
  secondLabel,
  secondInitial = '',
  onConfirm,
  onClose
}: PromptDialogProps) {
  const [value, setValue] = useState(initial);
  const [second, setSecond] = useState(secondInitial);
  const hasSecond = secondLabel !== undefined;
  const incomplete = value.trim() === '' || (hasSecond && second.trim() === '');

  useEffect(() => {
    if (!open) return;
    setValue(initial);
    setSecond(secondInitial);
  }, [open, initial, secondInitial]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (incomplete) return;
    onConfirm(value.trim(), second.trim());
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
        {hasSecond ? (
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASS}>{secondLabel}</span>
            <TextInput
              value={second}
              onChange={(event) => setSecond(event.target.value)}
              onFocus={(event) => event.target.select()}
              className="w-full"
            />
          </label>
        ) : null}
        <div className="mt-1 flex gap-2">
          <Button size="md" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={incomplete}
            className="flex-1"
          >
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
