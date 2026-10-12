import { useState } from 'react';
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
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);

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
	onClose()
	setDropdownOpen(null);
  }

  async function handleDisconnect(connection: ConnectionConfig) {
    try {
      await window.api.disconnectSession(connection.id);
    } catch (err) {
      // Error handling
    } finally {
      dispatch({ type: 'session/disconnected', connectionId: connection.id });
    }
    setDropdownOpen(null);
  }

  async function handleDelete(connection: ConnectionConfig) {
    if (!window.confirm('Delete connection "' + connection.name + '"?')) return;
    try {
      await window.api.deleteConnection(connection.id);
      dispatch({ type: 'connections/removed', id: connection.id });
    } catch (err) {
      // Error handling
    }
    setDropdownOpen(null);
  }

  function toggleDropdown(id: string) {
    setDropdownOpen(dropdownOpen === id ? null : id);
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
            <button type="button" onClick={() => {onAdd(); setDropdownOpen(null);}} className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500" aria-label="Create new connection">
              New Connection
            </button>
          </div>
          {allConnections.length > 0 ? (
            <div>
              <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="px-2 py-1.5 font-medium text-slate-500 dark:text-slate-400">Name</th>
                      <th className="px-2 py-1.5 font-medium text-slate-500 dark:text-slate-400">Host:Port</th>
                      <th className="px-2 py-1.5 font-medium text-slate-500 dark:text-slate-400">Last connected</th>
                      <th className="px-2 py-1.5 font-medium text-slate-500 dark:text-slate-400">Last modified</th>
                      <th className="px-2 py-1.5 font-medium text-slate-500 dark:text-slate-400 w-16 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allConnections.map((connection: ConnectionConfig) => {
                      const session = state.sessions[connection.id] ?? emptySession();
                      const isConnected = session.status === 'connected';
                      const lastConnected = isConnected ? 'just now' : 'never';
                      const lastModified = formatTime(connection.updatedAt ?? connection.createdAt);
                      const isDropdownOpen = dropdownOpen === connection.id;
                      return (
                        <tr key={connection.id} className="border-b border-slate-200 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900">
                          <td className="px-2 py-2">
                            <div className="font-medium text-slate-900 dark:text-slate-100">{connection.name}</div>
                          </td>
                          <td className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">{connection.host}:{connection.port}</td>
                          <td className="px-2 py-2 text-xs text-slate-400 dark:text-slate-500">{isConnected ? 'just now' : 'never'}</td>
                          <td className="px-2 py-2 text-xs text-slate-400 dark:text-slate-500">{formatTime(connection.updatedAt ?? connection.createdAt)}</td>
                          <td className="px-2 py-2 text-right">
                            <div className="relative inline-block">
                              <button
                                type="button"
                                onClick={() => toggleDropdown(connection.id)}
                                className="rounded p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800"
                                aria-label="Actions"
                                aria-expanded={isDropdownOpen}
                              >
                                ⋮
                              </button>
                              {isDropdownOpen && (
                                <div className="absolute right-0 top-full mt-1 z-10 rounded bg-white shadow-lg border border-slate-200 dark:bg-slate-900 dark:border-slate-800 py-1 min-w-[120px]">
                                  {isConnected ? (
                                    <button
                                      type="button"
                                      onClick={() => handleDisconnect(connection)}
                                      className="block w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                      Disconnect
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleConnect(connection)}
                                      className="block w-full text-left px-3 py-1.5 text-sm text-emerald-600 hover:bg-slate-100 dark:text-emerald-400 dark:hover:bg-slate-800"
                                    >
                                      Connect
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => { onEdit(connection); setDropdownOpen(null); }}
                                    className="block w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(connection)}
                                    className="block w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-slate-100 dark:text-red-400 dark:hover:bg-slate-800"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">No saved connections</p>
          )}
        </div>
      </div>
    </div>
  );
}