import { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';
import { messageOf } from '../lib/errors';
import { isMonacoDark } from '../lib/monaco';

interface DocumentModalProps {
  title: string;
  initialText: string;
  onSave(text: string): void;
  onClose(): void;
  saving?: boolean;
}

function validate(text: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return `Invalid JSON: ${messageOf(err)}`;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return 'Invalid JSON: document must be a plain object.';
  }
  return null;
}

export default function DocumentModal({
  title,
  initialText,
  onSave,
  onClose,
  saving
}: DocumentModalProps) {
  const [text, setText] = useState(initialText);
  const containerRef = useRef<HTMLDivElement>(null);
  const error = validate(text);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const editor = monaco.editor.create(container, {
      value: initialText,
      language: 'mongodb',
      fontSize: 13,
      minimap: { enabled: false },
      wordWrap: 'on',
      tabSize: 2,
      detectIndentation: false,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      theme: isMonacoDark() ? 'vs-dark' : 'vs'
    });
    const subscription = editor.onDidChangeModelContent(() => {
      setText(editor.getValue());
    });
    editor.focus();
    return () => {
      subscription.dispose();
      editor.dispose();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {title}
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
        <div
          ref={containerRef}
          className="h-80 w-full overflow-hidden rounded border border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
        />
        {error !== null ? (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(text)}
            disabled={error !== null || saving === true}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving === true ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
