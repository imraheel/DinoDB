import { useState } from 'react';
import { useApp } from '../context/AppState';
import { messageOf } from '../lib/errors';
import type { ConnectionConfig } from '../../../shared/types';
import Button from './ui/Button';
import Banner from './ui/Banner';

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
        <h1 className="text-[22px] font-semibold tracking-tight text-label">Welcome to DinoDB</h1>
        <p className="mt-1.5 text-[13px] text-label-secondary">
          Open a collection from the sidebar to start working.
        </p>
      </div>

      <ol className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-caption font-semibold text-accent">
              {index + 1}
            </span>
            <span className="text-xs text-label-secondary">{step}</span>
            {index < STEPS.length - 1 ? (
              <span className="text-label-tertiary" aria-hidden="true">
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
                  className="rounded-modal border border-border bg-surface p-3 text-left shadow-raise transition-colors duration-100 hover:border-accent/40 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        isConnected
                          ? 'h-1.5 w-1.5 shrink-0 rounded-full bg-success'
                          : 'h-1.5 w-1.5 shrink-0 rounded-full bg-label-tertiary/40'
                      }
                    />
                    <span className="min-w-0 truncate text-[13px] font-medium text-label">
                      {connection.name}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-label-secondary">
                    {connection.host}:{connection.port}
                  </p>
                  <p className="mt-2 text-caption font-medium text-accent">
                    {isConnecting ? 'Connecting…' : isConnected ? 'Connected' : 'Connect'}
                  </p>
                </button>
              );
            })}
          </div>
        ) : null}

        {error !== null ? (
          <Banner tone="error" className="rounded-field w-full border border-border text-center">
            {error}
          </Banner>
        ) : null}

        <div className="w-full rounded-modal border border-border bg-chrome/60 p-4">
          <p className="mb-2.5 text-caption font-semibold uppercase tracking-wide text-label-tertiary">
            Keyboard shortcuts
          </p>
          <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.label} className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-label-secondary">{shortcut.label}</span>
                <kbd className="shrink-0 rounded-[4px] border border-border bg-surface px-1.5 py-0.5 font-mono text-micro text-label-secondary">
                  {shortcut.keys}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Button size="md" className="px-4" onClick={onOpenManager}>
            Open connection manager
          </Button>
          <Button size="md" variant="primary" className="px-4" onClick={onNewConnection}>
            Create a new connection
          </Button>
        </div>

        <p className="text-micro text-label-tertiary">v{__APP_VERSION__}</p>
      </div>
    </div>
  );
}
