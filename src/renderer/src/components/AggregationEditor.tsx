import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import type { SchemaField } from '../../../shared/types';
import { isMonacoDark } from '../lib/monaco';

interface AggregationEditorProps {
  value: string;
  onChange(text: string): void;
  onRun(): void;
  loading: boolean;
  fields: SchemaField[];
}

export default function AggregationEditor({
  value,
  onChange,
  onRun,
  loading
}: AggregationEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const editor = monaco.editor.create(container, {
      value,
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
    editorRef.current = editor;
    const subscription = editor.onDidChangeModelContent(() => {
      changeRef.current(editor.getValue());
    });
    return () => {
      subscription.dispose();
      editorRef.current = null;
      editor.dispose();
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor !== null && editor.getValue() !== value) {
      editor.setValue(value);
    }
  }, [value]);

  return (
    <div className="flex shrink-0 flex-col gap-2 px-3 pt-3">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className="shrink-0 rounded bg-emerald-600 px-4 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Running…' : 'Run'}
        </button>
      </div>
      <div
        ref={containerRef}
        className="h-80 min-h-[320px] w-full flex-1 overflow-hidden rounded border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800"
      />
    </div>
  );
}
