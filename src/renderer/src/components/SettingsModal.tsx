import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../context/AppState';
import type { AppSettings } from '../../../shared/types';

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

const LABEL_CLASS = 'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400';
const INPUT_CLASS =
  'w-full rounded border border-slate-300 bg-slate-50 px-2 py-1 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

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

  if (!open) return null;

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Settings
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="px-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <span className={LABEL_CLASS}>Theme</span>
              <div className="flex overflow-hidden rounded border border-slate-300 dark:border-slate-700">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setForm((previous) => ({ ...previous, theme: option.value }))}
                    className={
                      form.theme === option.value
                        ? 'flex-1 bg-slate-900 px-3 py-1.5 text-sm text-white dark:bg-slate-100 dark:text-slate-900'
                        : 'flex-1 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <input
                id="settings-max-time"
                type="number"
                min={1000}
                max={300000}
                aria-label="Query timeout (ms)"
                className={INPUT_CLASS}
                value={form.maxTimeMs}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, maxTimeMs: Number(event.target.value) }))
                }
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Query timeout (ms)
              </p>
            </div>

            <div>
              <input
                id="settings-default-limit"
                type="number"
                min={1}
                max={1000}
                aria-label="Default row limit"
                className={INPUT_CLASS}
                value={form.defaultLimit}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, defaultLimit: Number(event.target.value) }))
                }
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Default row limit</p>
            </div>
          </div>

          {error !== null ? (
            <p className="mt-4 text-xs text-red-600 dark:text-red-400">{error}</p>
          ) : null}

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
