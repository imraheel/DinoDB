import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import * as monaco from 'monaco-editor';
import { messageOf } from '../lib/errors';
import { isMonacoDark } from '../lib/monaco';
import { parseShellJson } from '../lib/shell-json';

interface DocumentModalProps {
  title: string;
  initialText: string;
  onSave(text: string): void;
  onClose(): void;
  saving?: boolean;
  viewOnly?: boolean;
}

function validate(text: string): string | null {
  let parsed: unknown;
  try {
    parsed = parseShellJson(text);
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
  saving,
  viewOnly = false
}: DocumentModalProps) {
  const [text, setText] = useState(initialText);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 680, height: 480 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(
    null
  );
  const error = validate(text);

  function handleResizeMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: size.width,
      startHeight: size.height
    };
    setDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const drag = dragRef.current;
      if (drag === null) return;
      const nextWidth = drag.startWidth + (moveEvent.clientX - drag.startX);
      const nextHeight = drag.startHeight + (moveEvent.clientY - drag.startY);
      setSize({
        width: Math.min(1024, Math.max(320, nextWidth)),
        height: Math.min(800, Math.max(280, nextHeight))
      });
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      setDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

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
      readOnly: viewOnly,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        style={{ width: size.width, height: size.height }}
        className={`relative flex w-full flex-col rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900${dragging ? ' select-none' : ''}`}
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
          className="min-h-0 w-full flex-1 overflow-hidden rounded border border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
        />
        {viewOnly ? null : error !== null ? (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          {viewOnly ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Close
            </button>
          ) : (
            <>
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
            </>
          )}
        </div>
        <div
          role="separator"
          aria-label="Resize dialog"
          onMouseDown={handleResizeMouseDown}
          className="absolute bottom-0 right-0 z-10 h-3 w-3 cursor-nwse-resize"
        >
          <div className="absolute bottom-0.5 right-0.5 h-2 w-2 border-b-2 border-r-2 border-slate-300 dark:border-slate-600" />
        </div>
      </div>
    </div>
  );
}
