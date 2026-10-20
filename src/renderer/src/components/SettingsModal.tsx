import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useApp } from '../context/AppState';
import type { AccentSetting, AppSettings, CodeFontSetting, UiFontSetting } from '../../../shared/types';
import Button from './ui/Button';
import Modal, { ModalFooter, ModalHeader } from './ui/Modal';
import SegmentedControl from './ui/SegmentedControl';
import { BASE_INPUT_CLASS, TextInput } from './ui/Input';

interface SettingsModalProps {
  open: boolean;
  onClose(): void;
}

type SectionId = 'appearance' | 'keymap' | 'advanced';

const THEME_OPTIONS: { value: AppSettings['theme']; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' }
];

const ACCENT_OPTIONS: { value: AccentSetting; label: string; hex: string }[] = [
  { value: 'blue', label: 'Blue', hex: '#007aff' },
  { value: 'purple', label: 'Purple', hex: '#8944ab' },
  { value: 'pink', label: 'Pink', hex: '#e0407a' },
  { value: 'red', label: 'Red', hex: '#e0383e' },
  { value: 'orange', label: 'Orange', hex: '#f7630c' },
  { value: 'yellow', label: 'Yellow', hex: '#f0b000' },
  { value: 'green', label: 'Green', hex: '#28a844' },
  { value: 'graphite', label: 'Graphite', hex: '#8e8e93' }
];

const UI_FONT_OPTIONS: { value: UiFontSetting; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Monospace' }
];

const CODE_FONT_OPTIONS: { value: CodeFontSetting; label: string }[] = [
  { value: 'system-mono', label: 'System Mono' },
  { value: 'menlo', label: 'Menlo' },
  { value: 'consolas', label: 'Consolas' },
  { value: 'courier', label: 'Courier New' }
];

const UI_SIZE_OPTIONS = [12, 13, 14, 15];
const TABLE_SIZE_OPTIONS = [10, 11, 12, 13, 14];
const EDITOR_SIZE_OPTIONS = [11, 12, 13, 14, 15, 16, 17, 18];

interface ShortcutGroup {
  title: string;
  items: Array<{ keys: string; action: string }>;
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Query',
    items: [
      { keys: '⌘ ⏎', action: 'Run query at cursor' },
      { keys: '⌘ /', action: 'Toggle line comment' },
      { keys: '⌘ ⇧ /', action: 'Toggle block comment' },
      { keys: '⌥ ⇧ A', action: 'Toggle block comment (editor default)' }
    ]
  },
  {
    title: 'Documents',
    items: [
      { keys: '⌘ R', action: 'Refresh results' },
      { keys: '⌘ D', action: 'Insert document' },
      { keys: 'F3', action: 'View selected document' },
      { keys: '⌘ J', action: 'Edit selected document' },
      { keys: '⇧ ⌫', action: 'Delete selected document' },
      { keys: '⌘ ⇧ C', action: 'Copy document JSON' },
      { keys: '⌘ C', action: 'Copy cell value / row' }
    ]
  },
  {
    title: 'Application',
    items: [
      { keys: '⌘ N', action: 'New connection' },
      { keys: '⌘ O', action: 'Connect…' },
      { keys: '⌘ ,', action: 'Open settings' },
      { keys: '⌘ W', action: 'Close tab' },
      { keys: '⌘ Q', action: 'Quit' },
      { keys: '⌘ ⌥ I', action: 'Toggle developer tools' },
      { keys: '⌘ 0', action: 'Reset zoom' },
      { keys: '⌘ +', action: 'Zoom in' },
      { keys: '⌘ -', action: 'Zoom out' }
    ]
  }
];

function AppearanceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5v11a5.5 5.5 0 0 0 0-11z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function KeymapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="1.5" y="4" width="13" height="8" rx="1.5" />
      <path d="M4 7h.01M6.5 7h.01M9 7h.01M11.5 7h.01M5 9.5h6" strokeLinecap="round" />
    </svg>
  );
}

function AdvancedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M2 4.5h12M2 8h12M2 11.5h12" strokeLinecap="round" />
      <circle cx="5.5" cy="4.5" r="1.4" fill="var(--color-surface-raised)" />
      <circle cx="10" cy="8" r="1.4" fill="var(--color-surface-raised)" />
      <circle cx="6.5" cy="11.5" r="1.4" fill="var(--color-surface-raised)" />
    </svg>
  );
}

const SECTIONS: { id: SectionId; label: string; icon: ReactNode }[] = [
  { id: 'appearance', label: 'Appearance', icon: <AppearanceIcon /> },
  { id: 'keymap', label: 'Keymap', icon: <KeymapIcon /> },
  { id: 'advanced', label: 'Advance Settings', icon: <AdvancedIcon /> }
];

function PaneTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-label-tertiary">
      {children}
    </h3>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="text-xs text-label-secondary">{label}</span>
      {children}
    </label>
  );
}

function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange(value: T): void;
}) {
  return (
    <FieldRow label={label}>
      <select
        className={`${BASE_INPUT_CLASS} w-44 pr-6`}
        value={value}
        onChange={(event) => {
          const raw = event.target.value;
          const match = options.find((option) => String(option.value) === raw);
          if (match !== undefined) onChange(match.value);
        }}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldRow>
  );
}

function numberOptions(values: number[]): Array<{ value: number; label: string }> {
  return values.map((value) => ({ value, label: `${value} px` }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { state, dispatch } = useApp();
  const [section, setSection] = useState<SectionId>('appearance');
  const [form, setForm] = useState<AppSettings>({ ...state.settings });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({ ...state.settings });
    setError(null);
    setSaving(false);
  }, [open, state.settings]);

  function patchForm(partial: Partial<AppSettings>) {
    setForm((previous) => ({ ...previous, ...partial }));
  }

  async function handleSave() {
    const patch: AppSettings = {
      ...form,
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
    <Modal open={open} onClose={onClose} className="h-[560px] max-w-2xl" aria-label="Preferences">
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <ModalHeader title="Preferences" onClose={onClose} />
        <div className="flex min-h-0 flex-1">
          <nav
            className="w-44 shrink-0 space-y-0.5 border-r border-border bg-chrome p-2"
            aria-label="Settings sections"
          >
            {SECTIONS.map((item) => {
              const selected = item.id === section;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] transition-colors duration-100 ${
                    selected
                      ? 'bg-accent-soft font-medium text-accent'
                      : 'text-label-secondary hover:bg-well hover:text-label'
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="min-w-0 truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {section === 'appearance' ? (
              <div className="space-y-5">
                <div>
                  <PaneTitle>Theme</PaneTitle>
                  <SegmentedControl
                    value={form.theme}
                    options={THEME_OPTIONS}
                    onChange={(theme) => patchForm({ theme })}
                    ariaLabel="Theme"
                    className="w-full"
                  />
                </div>

                <div>
                  <PaneTitle>Accent color</PaneTitle>
                  <div className="flex items-center gap-2" role="radiogroup" aria-label="Accent color">
                    {ACCENT_OPTIONS.map((option) => {
                      const selected = option.value === form.accent;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={option.label}
                          title={option.label}
                          onClick={() => patchForm({ accent: option.value })}
                          className={`flex h-[22px] w-[22px] items-center justify-center rounded-full transition-shadow duration-100 ${
                            selected
                              ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface-raised'
                              : 'hover:ring-2 hover:ring-border-strong hover:ring-offset-2 hover:ring-offset-surface-raised'
                          }`}
                          style={{ backgroundColor: option.hex }}
                        >
                          {selected ? (
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 10 10"
                              fill="none"
                              stroke="#ffffff"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M1.5 5.5l2.5 2.5 4.5-5" />
                            </svg>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <PaneTitle>Fonts</PaneTitle>
                  <SelectField
                    label="UI font"
                    value={form.uiFont}
                    options={UI_FONT_OPTIONS}
                    onChange={(uiFont) => patchForm({ uiFont })}
                  />
                  <SelectField
                    label="Code font"
                    value={form.codeFont}
                    options={CODE_FONT_OPTIONS}
                    onChange={(codeFont) => patchForm({ codeFont })}
                  />
                  <p className="text-caption text-label-tertiary">
                    Code font applies to the data table and query editor.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <PaneTitle>Font sizes</PaneTitle>
                  <SelectField
                    label="Interface"
                    value={form.uiFontSize}
                    options={numberOptions(UI_SIZE_OPTIONS)}
                    onChange={(uiFontSize) => patchForm({ uiFontSize })}
                  />
                  <SelectField
                    label="Data table"
                    value={form.tableFontSize}
                    options={numberOptions(TABLE_SIZE_OPTIONS)}
                    onChange={(tableFontSize) => patchForm({ tableFontSize })}
                  />
                  <SelectField
                    label="Query editor"
                    value={form.editorFontSize}
                    options={numberOptions(EDITOR_SIZE_OPTIONS)}
                    onChange={(editorFontSize) => patchForm({ editorFontSize })}
                  />
                </div>
              </div>
            ) : null}

            {section === 'keymap' ? (
              <div className="space-y-5">
                {SHORTCUT_GROUPS.map((group) => (
                  <div key={group.title}>
                    <PaneTitle>{group.title}</PaneTitle>
                    <div className="overflow-hidden rounded-field border border-border">
                      {group.items.map((item, index) => (
                        <div
                          key={item.keys + item.action}
                          className={`flex items-center justify-between gap-4 px-3 py-1.5 ${
                            index > 0 ? 'border-t border-border' : ''
                          } ${index % 2 === 1 ? 'bg-well/40' : ''}`}
                        >
                          <span className="min-w-0 truncate text-xs text-label">{item.action}</span>
                          <kbd className="shrink-0 rounded-[4px] border border-border bg-surface px-1.5 py-0.5 font-mono text-micro text-label-secondary">
                            {item.keys}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-caption text-label-tertiary">
                  Shortcut customization is coming in a future update.
                </p>
              </div>
            ) : null}

            {section === 'advanced' ? (
              <div className="space-y-4">
                <div>
                  <PaneTitle>Query</PaneTitle>
                  <div className="space-y-3">
                    <div>
                      <TextInput
                        type="number"
                        min={1000}
                        max={300000}
                        aria-label="Query timeout (ms)"
                        className="w-full"
                        value={form.maxTimeMs}
                        onChange={(event) =>
                          patchForm({ maxTimeMs: Number(event.target.value) })
                        }
                      />
                      <p className="mt-1 text-caption text-label-tertiary">
                        Query timeout (ms) — hard cap enforced per tab
                      </p>
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
                          patchForm({ defaultLimit: Number(event.target.value) })
                        }
                      />
                      <p className="mt-1 text-caption text-label-tertiary">
                        Default row limit for new tabs
                      </p>
                    </div>
                  </div>
                </div>

                {error !== null ? <p className="text-xs text-danger">{error}</p> : null}
              </div>
            ) : null}

            {section !== 'advanced' && error !== null ? (
              <p className="mt-4 text-xs text-danger">{error}</p>
            ) : null}
          </div>
        </div>

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
