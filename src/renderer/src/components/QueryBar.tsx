import { useEffect, useRef, type KeyboardEvent } from 'react';
import * as monaco from 'monaco-editor';
import { useApp } from '../context/AppState';
import type { QueryInput } from '../../../shared/types';
import { isMonacoDark } from '../lib/monaco';

interface QueryBarProps {
  tabId: string;
  query: QueryInput;
  loading: boolean;
  onRun(): void;
}

const NUMBER_INPUT_CLASS =
  'w-20 rounded border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const LABEL_CLASS = 'text-xs text-slate-500 dark:text-slate-400';

export default function QueryBar({ tabId, query, loading, onRun }: QueryBarProps) {
  const { dispatch } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const changeRef = useRef<(text: string) => void>(() => {});
  changeRef.current = (text: string) => dispatch({ type: 'tab/query', tabId, patch: { text } });
  const runRef = useRef(onRun);
  runRef.current = onRun;

  function patch(partial: Partial<QueryInput>) {
    dispatch({ type: 'tab/query', tabId, patch: partial });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const modifier = /Mac/i.test(navigator.userAgent) ? event.metaKey : event.ctrlKey;
    if (modifier && event.key === 'Enter') {
      event.preventDefault();
      onRun();
    }
  }

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const editor = monaco.editor.create(container, {
      value: query.text,
      language: 'javascript',
      fontSize: 13,
      minimap: { enabled: false },
      wordWrap: 'on',
      tabSize: 2,
      detectIndentation: false,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      ariaLabel: 'Find query',
      theme: isMonacoDark() ? 'vs-dark' : 'vs'
    });
    editorRef.current = editor;
    const subscription = editor.onDidChangeModelContent(() => {
      changeRef.current(editor.getValue());
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
    return () => {
      subscription.dispose();
      editorRef.current = null;
      editor.dispose();
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor !== null && editor.getValue() !== query.text) {
      editor.setValue(query.text);
    }
  }, [query.text]);

  return (
    <div className="flex flex-col gap-2 border-b border-slate-200 px-3 py-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2" onKeyDown={handleKeyDown}>
        <label className="flex items-center gap-1">
          <span className={LABEL_CLASS}>Skip</span>
          <input
            aria-label="Skip"
            type="number"
            min={0}
            value={query.skip}
            onChange={(event) => patch({ skip: event.target.value })}
            className={NUMBER_INPUT_CLASS}
          />
        </label>
        <label className="flex items-center gap-1">
          <span className={LABEL_CLASS}>Limit</span>
          <input
            aria-label="Limit"
            type="number"
            min={1}
            value={query.limit}
            onChange={(event) => patch({ limit: event.target.value })}
            className={NUMBER_INPUT_CLASS}
          />
        </label>
        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className="ms-auto shrink-0 rounded bg-emerald-600 px-4 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Running…' : 'Run'}
        </button>
      </div>
      <div
        ref={containerRef}
        className="h-48 min-h-[192px] w-full overflow-hidden rounded border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800"
      />
    </div>
  );
}
