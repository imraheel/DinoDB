import { useState } from 'react';
import { useApp } from '../context/AppState';
import { messageOf } from '../lib/errors';
import type { ConnectionConfig } from '../../../shared/types';

interface WelcomeScreenProps {
  onOpenManager(): void;
  onNewConnection(): void;
}

const RECENT_LIMIT = 3;
const IS_MAC = /Mac/i.test(navigator.userAgent);

const STEPS = [
  'Create a connection',
  'Expand a database in the sidebar',
  'Run a query & explore documents'
];

const SHORTCUTS: { label: string; keys: string }[] = [
  { label: 'Settings', keys: IS_MAC ? '⌘ ,' : 'Ctrl+,' },
  { label: 'New connection', keys: IS_MAC ? '⌘ N' : 'Ctrl+N' },
  { label: 'Connection manager', keys: IS_MAC ? '⌘ O' : 'Ctrl+O' },
  { label: 'Run query', keys: IS_MAC ? '⌘ ⏎' : 'Ctrl+Enter' },
  { label: 'Refresh results', keys: IS_MAC ? '⌘ R' : 'Ctrl+R' },
  { label: 'View document', keys: 'F3' }
];


export default function WelcomeScreen({ onOpenManager, onNewConnection }: WelcomeScreenProps) {
  const { state, dispatch } = useApp();
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recentConnections = state.connections
    .filter((connection: ConnectionConfig) => connection.lastConnectedAt !== null)
    .sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
    .slice(0, RECENT_LIMIT);

  async function quickConnect(connection: ConnectionConfig) {
    if (connectingId !== null) return;
    setConnectingId(connection.id);
    setError(null);
    dispatch({ type: 'session/connecting', connectionId: connection.id });
    try {
      const { databases } = await window.api.connectSession(connection.id);
      dispatch({ type: 'session/connected', connectionId: connection.id, databases });
      const connections = await window.api.listConnections();
      dispatch({ type: 'connections/loaded', connections });
    } catch (err) {
      const message = messageOf(err);
      dispatch({ type: 'session/errored', connectionId: connection.id, error: message });
      setError(message);
    } finally {
      setConnectingId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 overflow-y-auto px-6 py-8">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Welcome to NexDB
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Open a collection from the sidebar to start working.
        </p>
      </div>

      <ol className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              {index + 1}
            </span>
            <span className="text-xs text-slate-600 dark:text-slate-300">{step}</span>
            {index < STEPS.length - 1 ? (
              <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="flex w-full max-w-xl flex-col items-center gap-4">
        {recentConnections.length > 0 ? (
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
            {recentConnections.map((connection) => {
              const session = state.sessions[connection.id];
              const isConnected = session?.status === 'connected';
              const isConnecting = connectingId === connection.id;
              const isBusy = connectingId !== null && !isConnecting;
              return (
                <button
                  key={connection.id}
                  type="button"
                  onClick={() => void quickConnect(connection)}
                  disabled={isBusy || isConnecting || isConnected}
                  className="rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-emerald-400 hover:bg-emerald-50/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        isConnected
                          ? 'h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500'
                          : 'h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600'
                      }
                    />
                    <span className="min-w-0 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {connection.name}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                    {connection.host}:{connection.port}
                  </p>
                  <p className="mt-2 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    {isConnecting
                      ? 'Connecting…'
                      : isConnected
                        ? 'Connected'
                        : 'Connect'}
                  </p>
                </button>
              );
            })}
          </div>
        ) : null}

        {error !== null ? (
          <p className="w-full rounded border border-red-200 bg-red-50 px-3 py-1.5 text-center text-xs text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <div className="w-full rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Keyboard shortcuts
          </p>
          <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.label} className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-slate-600 dark:text-slate-300">
                  {shortcut.label}
                </span>
                <kbd className="shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                  {shortcut.keys}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onOpenManager}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Open connection manager
          </button>
          <button
            type="button"
            onClick={onNewConnection}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Create a new connection
          </button>
        </div>

        <p className="text-[11px] text-slate-400 dark:text-slate-600">v{__APP_VERSION__}</p>
      </div>
    </div>
  );
}
