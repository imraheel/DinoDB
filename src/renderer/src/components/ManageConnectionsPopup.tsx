import { useApp } from '../context/AppState';
import { emptySession, type SessionState } from '../context/reducer';
import { messageOf } from '../lib/errors';
import type { ConnectionConfig } from '../../../shared/types';

interface ManageConnectionsPopupProps {
  open: boolean;
  onClose(): void;
  onAdd(): void;
  onEdit(connection: ConnectionConfig): void;
}

export default function ManageConnectionsPopup({
  open,
  onClose,
  onAdd,
  onEdit
}: ManageConnectionsPopupProps) {
  const { state, dispatch } = useApp();

  const allConnections = state.connections;

  if (!open) return null;

  function formatTime(ts: number | undefined): string {
    if (ts === undefined) return '—';
    const date = new Date(ts);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 65) return diffMinutes + ' minute' + (diffMinutes !== 1 ? 's' : '') + ' ago';
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 48) return diffHours + ' hour' + (diffHours !== 1 ? 's' : '') + ' ago';
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return diffDays + ' day' + (diffDays !== 1 ? 's' : '') + ' ago';
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return diffMonths + ' month' + (diffMonths !== 1 ? 's' : '') + ' ago';
    const diffYears = Math.floor(diffDays / 365);
    return diffYears + ' year' + (diffYears !== 1 ? 's' : '') + ' ago';
  }

  async function handleConnect(connection: ConnectionConfig) {
    dispatch({ type: 'session/connecting', connectionId: connection.id });
    try {
      const { databases } = await window.api.connectSession(connection.id);
      dispatch({ type: 'session/connected', connectionId: connection.id, databases });
    } catch (err) {
      const message = messageOf(err);
      dispatch({ type: 'session/errored', connectionId: connection.id, error: message });
    }
    onClose();
  }

  async function handleDisconnect(connection: ConnectionConfig) {
    try {
      await window.api.disconnectSession(connection.id);
    } catch (err) {
      // Error handling
    } finally {
      dispatch({ type: 'session/disconnected', connectionId: connection.id });
	  onClose();
    }
  }

  async function handleDelete(connection: ConnectionConfig) {
    if (!window.confirm('Delete connection "' + connection.name + '"?')) return;
    try {
      await window.api.deleteConnection(connection.id);
      dispatch({ type: 'connections/removed', id: connection.id });
    } catch (err) {
      // Error handling
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="max-w-lg w-full max-h-[90vh] rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">Manage connections</h3>
            <button type="button" onClick={onClose} aria-label="Close" className="px-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
              ✕
            </button>
          </div>
          <div>
            <button type="button" onClick={() => onAdd()} className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 mb-3" aria-label="Create new connection">
              New Connection
            </button>
          </div>
          {allConnections.length > 0 ? (
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Existing connections:</p>
              {allConnections.map((connection: ConnectionConfig) => {
                const session = state.sessions[connection.id] ?? emptySession();
                const isConnected = session.status === 'connected';
                const lastConnected = isConnected ? 'just now' : 'never';
                const lastModified = formatTime(connection.updatedAt ?? connection.createdAt);
                return (
                  <div
                    key={connection.id}
                    className="flex items-center justify-between px-1 py-2 border-b border-slate-200 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="font-medium text-sm text-slate-900 dark:text-slate-100">
                          {connection.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {connection.host}:{connection.port}
                        </div>
                      </div>
                    </div>
                    <div className="flex text-xs gap-2">
                      <span className="text-slate-400 dark:text-slate-500">Last connected: {lastConnected}</span>
                      <span className="text-slate-400 dark:text-slate-500">Last modified: {lastModified}</span>
                    </div>
                    <div className="flex gap-1">
                      {isConnected ? (
                        <button type="button" onClick={() => { handleDisconnect(connection); }} className="shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700" aria-label={`Disconnect ${connection.name}`}>
                          Disconnect
                        </button>
                      ) : (
                        <button type="button" onClick={() => handleConnect(connection)} className="shrink-0 rounded border border-emerald-300 px-1.5 py-0.5 text-xs font-medium text-emerald-600 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900" aria-label={`Connect to ${connection.name}`}>
                          Connect
                        </button>
                      )}
                      <button type="button" onClick={() => { onEdit(connection); }} className="shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700" aria-label={`Edit ${connection.name}`}>
                        ✎
                      </button>
                      <button type="button" onClick={() => { handleDelete(connection); }} className="shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-100 dark:border-slate-700 dark:text-red-400 dark:hover:bg-red-900" aria-label={`Delete ${connection.name}`}>
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">No saved connections</p>
          )}
        </div>
      </div>
    </div>
  );
}
