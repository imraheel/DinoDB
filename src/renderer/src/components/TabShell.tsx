import { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';
import type { TabMeta } from '../context/reducer';
import { useApp } from '../context/AppState';
import { isMonacoDark } from '../lib/monaco';
import { codeFontStack } from '../lib/appearance';
import { messageOf } from '../lib/errors';
import { shellActive, type ShellProgress } from '../../../shared/shell';
import Button from './ui/Button';
import Banner from './ui/Banner';

export default function TabShell({ tab, active }: { tab: TabMeta; active: boolean }) {
  const { state } = useApp();
  const [progress, setProgress] = useState<ShellProgress>({
    tabId: tab.id,
    state: 'idle',
    output: '',
    truncated: false,
    elapsedMs: 0
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const runRef = useRef<() => void>(() => {});
  const output = useRef<HTMLPreElement>(null);
  const busy = submitting || shellActive(progress.state);
  async function run() {
    if (busy) return;
    setError(null);
    setSubmitting(true);
    try {
      await window.api.startShell(tab.id, editor.current?.getValue() ?? '');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }
  runRef.current = () => void run();
  useEffect(() => {
    let alive = true;
    let received = false;
    const unsubscribe = window.api.onShellProgress((next) => {
      if (next.tabId === tab.id && alive) {
        received = true;
        setProgress(next);
      }
    });
    async function snapshot() {
      try {
        const next = await window.api.shellSnapshot(tab.id);
        if (alive && !received) setProgress(next);
      } catch (err) {
        if (alive) setError(messageOf(err));
      }
    }
    void snapshot();
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [tab.id]);
  useEffect(() => {
    if (!container.current) return;
    const instance = monaco.editor.create(container.current, {
      value: `// Full Mongosh JavaScript. Use print() or printjson() for output.\nconst result = db.getCollection(${JSON.stringify(tab.collection)}).find({\n  \n}).limit(20).toArray();\nprintjson(result);\n`,
      language: 'mongodb',
      fontSize: state.settings.editorFontSize,
      fontFamily: codeFontStack(state.settings.codeFont),
      theme: isMonacoDark() ? 'dinodb-dark' : 'dinodb-light',
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      tabSize: 2,
      wordWrap: 'on',
      ariaLabel: 'Mongosh script'
    });
    editor.current = instance;
    const action = instance.addAction({
      id: 'dinodb-run-shell',
      label: 'Run shell script',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => runRef.current()
    });
    return () => {
      action.dispose();
      instance.getModel()?.dispose();
      instance.dispose();
      editor.current = null;
    };
  }, [tab.id]);
  useEffect(() => {
    editor.current?.updateOptions({
      fontSize: state.settings.editorFontSize,
      fontFamily: codeFontStack(state.settings.codeFont),
      readOnly: busy
    });
  }, [state.settings.editorFontSize, state.settings.codeFont, busy]);
  useEffect(() => {
    if (active) editor.current?.layout();
  }, [active]);
  useEffect(() => {
    if (output.current) output.current.scrollTop = output.current.scrollHeight;
  }, [progress.output]);
  return (
    <div className={`h-full min-h-0 flex-col bg-surface ${active ? 'flex' : 'hidden'}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span
          className="min-w-0 flex-1 truncate text-xs text-label-secondary"
          title={`${tab.connectionName} / ${tab.database}`}
        >
          Mongosh · {tab.connectionName} / {tab.database}
        </span>
        <Button onClick={() => window.dispatchEvent(new Event('open-database-tools'))}>
          Tools…
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void run()}>
          Run script
        </Button>
        <Button
          disabled={!shellActive(progress.state) || progress.state === 'cancelling'}
          onClick={() => {
            void window.api.cancelShell(tab.id).catch((err: unknown) => setError(messageOf(err)));
          }}
        >
          Stop
        </Button>
      </div>
      <p className="border-b border-border px-3 py-2 text-xs text-label-tertiary">
        Each run starts a fresh shell. Scripts run locally with your permissions. Use print() or
        printjson() for output. ⌘/Ctrl+Enter runs the script.
      </p>
      <div ref={container} className="min-h-[160px] flex-1 border-b border-border" />
      {error || progress.error ? <Banner>{error ?? progress.error}</Banner> : null}
      <div
        className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-label-secondary"
        role="status"
      >
        <span>
          {progress.state} · {(progress.elapsedMs / 1000).toFixed(1)}s
          {progress.exitCode !== undefined ? ` · exit ${progress.exitCode}` : ''}
        </span>
        <span>
          {progress.truncated ? 'Earlier output truncated · ' : ''}Timeout:{' '}
          {state.settings.maxTimeMs / 1000}s
        </span>
      </div>
      <pre
        ref={output}
        aria-label="Mongosh console output"
        tabIndex={0}
        className="min-h-[120px] flex-1 select-text overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs text-label"
      >
        {progress.output || 'Console output will appear here.'}
      </pre>
    </div>
  );
}
