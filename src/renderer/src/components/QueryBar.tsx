import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import * as monaco from 'monaco-editor';
import { useApp } from '../context/AppState';
import type { TabMeta } from '../context/reducer';
import type { QueryInput } from '../../../shared/types';
import { isMonacoDark } from '../lib/monaco';
import Button from './ui/Button';
import { BASE_INPUT_CLASS, FRAME_CLASS } from './ui/Input';

interface QueryBarProps {
  tab: TabMeta;
  query: QueryInput;
  loading: boolean;
  active: boolean;
  onRun(): void;
}

const NUMBER_INPUT_CLASS = `${BASE_INPUT_CLASS} w-20 font-mono text-xs`;
const LABEL_CLASS = 'text-xs text-label-secondary';

export default function QueryBar({ tab, query, loading, active, onRun }: QueryBarProps) {
  const { dispatch } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const changeRef = useRef<(text: string) => void>(() => {});
  changeRef.current = (text: string) =>
    dispatch({ type: 'tab/query', tabId: tab.id, patch: { text } });
  const runRef = useRef(onRun);
  runRef.current = onRun;
  const [editorHeight, setEditorHeight] = useState(192);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  function handleResizeMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    dragRef.current = { startY: event.clientY, startHeight: editorHeight };
    setDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const drag = dragRef.current;
      if (drag === null) return;
      const next = drag.startHeight + (moveEvent.clientY - drag.startY);
      setEditorHeight(Math.min(600, Math.max(96, next)));
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

  function patch(partial: Partial<QueryInput>) {
    dispatch({ type: 'tab/query', tabId: tab.id, patch: partial });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return;
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
      language: 'mongodb',
      fontSize: 13,
      minimap: { enabled: false },
      wordWrap: 'on',
      tabSize: 2,
      detectIndentation: false,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      ariaLabel: 'Find query',
      theme: isMonacoDark() ? 'nexdb-dark' : 'nexdb-light'
    });
    editorRef.current = editor;
    const subscription = editor.onDidChangeModelContent(() => {
      changeRef.current(editor.getValue());
    });
    const runSubscription = editor.onKeyDown((event) => {
      if (event.equals(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter)) {
        event.preventDefault();
        event.stopPropagation();
        runRef.current();
      }
    });
    return () => {
      subscription.dispose();
      runSubscription.dispose();
      editorRef.current = null;
      editor.dispose();
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    editorRef.current?.layout();
  }, [active]);

  return (
    <div className="relative flex flex-col gap-2.5 border-b border-border px-3 py-3">
      <div className="flex flex-wrap items-center gap-2" onKeyDown={handleKeyDown}>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-medium text-label">{tab.title}</h2>
          <p className="truncate text-caption text-label-tertiary">
            {tab.connectionName} · {tab.database}.{tab.collection}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-1.5">
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
        <label className="flex shrink-0 items-center gap-1.5">
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
        <Button variant="primary" size="md" pill onClick={onRun} disabled={loading} className="px-4">
          {loading ? 'Running…' : 'Run'}
        </Button>
      </div>
      <div ref={containerRef} style={{ height: editorHeight }} className={`w-full ${FRAME_CLASS}${dragging ? ' select-none' : ''}`} />
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize query editor"
        onMouseDown={handleResizeMouseDown}
        className="absolute inset-x-0 bottom-0 z-10 h-1 cursor-row-resize hover:bg-accent/40"
      />
    </div>
  );
}
