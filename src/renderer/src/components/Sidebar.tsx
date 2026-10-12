import { useState } from 'react';
import { useApp } from '../context/AppState';
import { emptySession, type SessionState } from '../context/reducer';
import { messageOf } from '../lib/errors';
import type { ConnectionConfig } from '../../../shared/types';
import ManageConnectionsPopup from './ManageConnectionsPopup';

interface SidebarProps {
  onAdd: () => void;
  onEdit: (connection: ConnectionConfig) => void;
}

export default function Sidebar({ onAdd, onEdit }: SidebarProps) {
  const { state, dispatch } = useApp();
  const [showManagePopup, setShowManagePopup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allConnections = state.connections;
  const connectedConnections = allConnections.filter(
    (c: ConnectionConfig) => state.sessions[c.id]?.status === 'connected'
  );

  async function handleDelete(connection: ConnectionConfig) {
    if (!window.confirm('Delete connection "' + connection.name + '"?')) return;
    try {
      await window.api.deleteConnection(connection.id);
      dispatch({ type: 'connections/removed', id: connection.id });
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
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
  }

  async function handleDisconnect(connection: ConnectionConfig) {
    try {
      await window.api.disconnectSession(connection.id);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      dispatch({ type: 'session/disconnected', connectionId: connection.id });
    }
  }

  async function handleToggle(connectionId: string, database: string, session: SessionState) {
    const willExpand = !(session.expanded[database] ?? false);
    dispatch({ type: 'session/expand', connectionId, database });
    if (!willExpand || session.collections[database] !== undefined) return;
    try {
      const { collections } = await window.api.listCollections(connectionId, database);
      dispatch({ type: 'session/collections', connectionId, database, collections });
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function handleOpenCollection(connection: ConnectionConfig, database: string, collection: string) {
    try {
      const { tabId, fields } = await window.api.createTab({
        connectionId: connection.id,
        database,
        collection
      });
      dispatch({
        type: 'tab/added',
        tab: {
          id: tabId,
          connectionId: connection.id,
          connectionName: connection.name,
          database,
          collection,
          title: database + '.' + collection
        },
        fields
      });
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          NexDB
        </span>
        <button
          type="button"
          onClick={() => setShowManagePopup(true)}
          className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-500"
          aria-label="Manage connections"
        >
          Connect
        </button>
      </div>
      <ManageConnectionsPopup
        open={showManagePopup}
        onClose={() => setShowManagePopup(false)}
        onAdd={onAdd}
        onEdit={onEdit}
      />
      {error !== null ? (
        <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="shrink-0 font-bold hover:text-red-800 dark:hover:text-red-300"
          >
            ✕
          </button>
        </div>
      ) : null}
      <div className="flex-1 overflow-y-auto py-1">
        {connectedConnections.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
            No connections yet. Use "Connect" to add one.
          </p>
        ) : null}
        {connectedConnections.map((connection: ConnectionConfig) => {
          const session = state.sessions[connection.id] ?? emptySession();
          return (
            <div
              key={connection.id}
              className="group px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <div className="flex items-center">
                <span className="min-w-0 flex-1 truncate text-sm text-slate-900 dark:text-slate-100">
                  {connection.name}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">
                  {connection.host}:{connection.port}
                </span>
                {session.status === 'connected' ? (
                  <button
                    type="button"
                    onClick={() => void handleDisconnect(connection)}
                    className="shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                    aria-label={`Disconnect ${connection.name}`}
                  >
                    Disconnect
                  </button>
                ) : null}
              </div>
              {session.status === 'connected' ? (
                <div className="mt-0.5">
                  {session.databases.map((database) => {
                    const expanded = session.expanded[database] ?? false;
                    const collections = session.collections[database];
                    return (
                      <div key={database}>
                        <button
                          type="button"
                          onClick={() => void handleToggle(connection.id, database, session)}
                          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-sm text-slate-700 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                          <span className="w-3 shrink-0 text-slate-400 dark:text-slate-500">
                            {expanded ? '▾' : '▸'}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{database}</span>
                        </button>
                        {expanded ? (
                          <div className="pl-4">
                            {collections === undefined || collections === 'loading' ? (
                              <p className="px-1 py-0.5 text-xs text-slate-500 dark:text-slate-400">
                                Loading…
                              </p>
                            ) : collections.length === 0 ? (
                              <p className="px-1 py-0.5 text-xs text-slate-500 dark:text-slate-400">
                                No collections
                              </p>
                            ) : (
                              collections.slice().sort().map((collection) => (
                                <button
                                  key={collection}
                                  type="button"
                                  onClick={() =>
                                    void handleOpenCollection(connection, database, collection)
                                  }
                                  className="block w-full truncate rounded px-1 py-0.5 text-left text-sm text-slate-700 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                                >
                                  {collection}
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}