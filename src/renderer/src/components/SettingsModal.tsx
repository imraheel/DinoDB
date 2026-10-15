import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../context/AppState';
import type { AppSettings } from '../../../shared/types';
import Button from './ui/Button';
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal';
import SegmentedControl from './ui/SegmentedControl';
import { TextInput } from './ui/Input';

interface SettingsModalProps {
  open: boolean;
  onClose(): void;
}

interface FormState {
  theme: AppSettings['theme'];
  maxTimeMs: number;
  defaultLimit: number;
}

const THEME_OPTIONS: { value: AppSettings['theme']; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' }
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { state, dispatch } = useApp();
  const [form, setForm] = useState<FormState>({
    theme: state.settings.theme,
    maxTimeMs: state.settings.maxTimeMs,
    defaultLimit: state.settings.defaultLimit
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      theme: state.settings.theme,
      maxTimeMs: state.settings.maxTimeMs,
      defaultLimit: state.settings.defaultLimit
    });
    setError(null);
    setSaving(false);
  }, [open, state.settings.theme, state.settings.maxTimeMs, state.settings.defaultLimit]);

  async function handleSave() {
    const patch = {
      theme: form.theme,
      maxTimeMs: clamp(form.maxTimeMs, 1000, 300000),
      defaultLimit: clamp(form.defaultLimit, 1, 1000)
    };
    setSaving(true);
    setError(null);
    try {
      const saved = await window.api.saveSettings(patch);
      dispatch({ type: 'settings/patched', patch: saved });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void handleSave();
  }

  return (
    <Modal open={open} onClose={onClose} className="max-w-md" aria-label="Settings">
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <ModalHeader title="Settings" onClose={onClose} />
        <ModalBody className="space-y-4">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-label-secondary">Theme</span>
            <SegmentedControl
              value={form.theme}
              options={THEME_OPTIONS}
              onChange={(theme) => setForm((previous) => ({ ...previous, theme }))}
              ariaLabel="Theme"
              className="w-full"
            />
          </div>

          <div>
            <TextInput
              type="number"
              min={1000}
              max={300000}
              aria-label="Query timeout (ms)"
              className="w-full"
              value={form.maxTimeMs}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, maxTimeMs: Number(event.target.value) }))
              }
            />
            <p className="mt-1 text-caption text-label-tertiary">Query timeout (ms)</p>
          </div>

          <div>
            <TextInput
              type="number"
              min={1}
              max={1000}
              aria-label="Default row limit"
              className="w-full"
              value={form.defaultLimit}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, defaultLimit: Number(event.target.value) }))
              }
            />
            <p className="mt-1 text-caption text-label-tertiary">Default row limit</p>
          </div>

          {error !== null ? <p className="text-xs text-danger">{error}</p> : null}
        </ModalBody>
        <ModalFooter>
          <Button size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={saving}>
            Save
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
