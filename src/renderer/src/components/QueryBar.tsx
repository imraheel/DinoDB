import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import * as monaco from 'monaco-editor';
import { useApp } from '../context/AppState';
import type { TabMeta } from '../context/reducer';
import type { QueryInput } from '../../../shared/types';
import { isMonacoDark } from '../lib/monaco';
import { pageSkip } from '../lib/pagination';
import { queryAtOffset } from '../lib/shell-query';
import Button from './ui/Button';
import { BASE_INPUT_CLASS, FRAME_CLASS } from './ui/Input';

interface QueryBarProps {
  tab: TabMeta;
  query: QueryInput;
  loading: boolean;
  active: boolean;
  hasMore: boolean;
  onRun(text: string, skipOverride?: number): void;
  onRunAll(text: string): void;
  onLastPage(text: string): void;
}

const NUMBER_INPUT_CLASS = `${BASE_INPUT_CLASS} w-20 font-mono text-xs`;
const LABEL_CLASS = 'text-xs text-label-secondary';

interface IconProps {
  size?: number;
}

function ChevronsLeftIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m11 17-5-5 5-5" />
      <path d="m18 17-5-5 5-5" />
    </svg>
  );
}

function ChevronLeftIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function ChevronsRightIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 17 5-5-5-5" />
      <path d="m13 17 5-5-5-5" />
    </svg>
  );
}

export default function QueryBar({
  tab,
  query,
  loading,
  active,
  hasMore,
  onRun,
  onRunAll,
  onLastPage
}: QueryBarProps) {
  const { dispatch } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const changeRef = useRef<(text: string) => void>(() => {});
  changeRef.current = (text: string) =>
    dispatch({ type: 'tab/query', tabId: tab.id, patch: { text } });
  const textRef = useRef(query.text);
  textRef.current = query.text;
  const runRef = useRef(onRun);
  runRef.current = onRun;
  const [editorHeight, setEditorHeight] = useState(192);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  function activeQueryText(): string {
    const editor = editorRef.current;
    if (editor === null) return textRef.current;
    const model = editor.getModel();
    if (model === null) return editor.getValue();
    const selection = editor.getSelection();
    if (selection !== null && !selection.isEmpty()) {
      return model.getValueInRange(selection);
    }
    const position = editor.getPosition();
    const offset =
      position === null ? 0 : model.getOffsetAt(position);
    const segment = queryAtOffset(model.getValue(), offset);
    return segment?.text ?? model.getValue();
  }

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

  const pageSize = Math.min(1000, Math.max(1, Number(query.limit) || 50));
  const currentSkip = Math.max(0, Number(query.skip) || 0);
  const atFirstPage = currentSkip <= 0;
  const atLastPage = !hasMore;

  function goToSkip(action: 'first' | 'prev' | 'next') {
    const skip = pageSkip(action, currentSkip, pageSize);
    patch({ skip: String(skip) });
    onRun(activeQueryText(), skip);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return;
    const modifier = /Mac/i.test(navigator.userAgent) ? event.metaKey : event.ctrlKey;
    if (modifier && !event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      onRun(activeQueryText());
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
        runRef.current(activeQueryText());
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
        <div className="flex shrink-0 items-center" role="group" aria-label="Pagination">
          <Button
            variant="quiet"
            size="sm"
            aria-label="First page"
            title="First page"
            disabled={loading || atFirstPage}
            onClick={() => goToSkip('first')}
            className="w-8 px-0"
          >
            <ChevronsLeftIcon />
          </Button>
          <Button
            variant="quiet"
            size="sm"
            aria-label="Previous page"
            title="Previous page"
            disabled={loading || atFirstPage}
            onClick={() => goToSkip('prev')}
            className="w-8 px-0"
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="quiet"
            size="sm"
            aria-label="Next page"
            title="Next page"
            disabled={loading || atLastPage}
            onClick={() => goToSkip('next')}
            className="w-8 px-0"
          >
            <ChevronRightIcon />
          </Button>
          <Button
            variant="quiet"
            size="sm"
            aria-label="Last page"
            title="Last page"
            disabled={loading || atLastPage}
            onClick={() => onLastPage(activeQueryText())}
            className="w-8 px-0"
          >
            <ChevronsRightIcon />
          </Button>
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
        <Button
          variant="primary"
          size="md"
          pill
          onClick={() => onRun(activeQueryText())}
          disabled={loading}
          title="Run query at cursor (⌘⏎)"
          className="px-4"
        >
          Run
        </Button>
        <Button
          variant="default"
          size="md"
          pill
          onClick={() => onRunAll(editorRef.current?.getValue() ?? query.text)}
          disabled={loading}
          title="Run entire script"
          className="px-4"
        >
          Run all
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
