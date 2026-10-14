import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useApp } from '../context/AppState';
import { emptySession, type SessionState } from '../context/reducer';
import { messageOf } from '../lib/errors';
import type { ConnectionConfig } from '../../../shared/types';
import ConfirmDialog from './ConfirmDialog';
import ManageConnectionsPopup from './ManageConnectionsPopup';
import PromptDialog from './PromptDialog';

interface SidebarProps {
  onAdd: () => void;
  onEdit: (connection: ConnectionConfig) => void;
  manageOpen: boolean;
  onManageOpen: () => void;
  onManageClose: () => void;
}

type SidebarSelection =
  | { kind: 'database'; connectionId: string; database: string }
  | { kind: 'collection'; connectionId: string; database: string; collection: string };

type SidebarMenu =
  | { kind: 'database'; x: number; y: number; connection: ConnectionConfig; database: string }
  | {
      kind: 'collection';
      x: number;
      y: number;
      connection: ConnectionConfig;
      database: string;
      collection: string;
    };

const MENU_ITEM_CLASS =
  'flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';
const MENU_DANGER_CLASS =
  'flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950';
const MENU_SEPARATOR_CLASS = 'my-1 h-px bg-slate-200 dark:bg-slate-700';
const SELECTED_CLASS =
  'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-100';

type SidebarPrompt = {
  title: string;
  label: string;
  initial: string;
  confirmLabel: string;
  confirm(value: string): void | Promise<void>;
};

type SidebarConfirm = {
  title: string;
  message: string;
  confirmLabel: string;
  confirm(): void | Promise<void>;
};

export default function Sidebar({
  onAdd,
  onEdit,
  manageOpen,
  onManageOpen,
  onManageClose
}: SidebarProps) {
  const { state, dispatch } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(256);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [selection, setSelection] = useState<SidebarSelection | null>(null);
  const [menu, setMenu] = useState<SidebarMenu | null>(null);
  const [prompt, setPrompt] = useState<SidebarPrompt | null>(null);
  const [confirm, setConfirm] = useState<SidebarConfirm | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function handleResizeMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startWidth: width };
    setDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const drag = dragRef.current;
      if (drag === null) return;
      const next = drag.startWidth + (moveEvent.clientX - drag.startX);
      setWidth(Math.min(480, Math.max(160, next)));
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

  useEffect(() => {
    if (menu === null) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current !== null && menuRef.current.contains(event.target as Node)) return;
      setMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(null);
        setSelection(null);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menu]);

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
      const connections = await window.api.listConnections();
      dispatch({ type: 'connections/loaded', connections });
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

  async function refreshCollections(connectionId: string, database: string) {
    try {
      const { collections } = await window.api.listCollections(connectionId, database);
      dispatch({ type: 'session/collections', connectionId, database, collections });
    } catch (err) {
      setError(messageOf(err));
    }
  }

  function copyName(name: string) {
    void navigator.clipboard.writeText(name).catch(() => {});
  }

  function promptAddCollection(connection: ConnectionConfig, database: string) {
    setPrompt({
      title: 'Add collection',
      label: 'Collection name',
      initial: '',
      confirmLabel: 'Create',
      confirm: async (name) => {
        try {
          await window.api.adminSession(connection.id, {
            kind: 'createCollection',
            database,
            name
          });
          await refreshCollections(connection.id, database);
        } catch (err) {
          setError(messageOf(err));
        }
      }
    });
  }

  function promptRenameCollection(
    connection: ConnectionConfig,
    database: string,
    collection: string
  ) {
    setPrompt({
      title: 'Rename collection',
      label: 'New name',
      initial: collection,
      confirmLabel: 'Rename',
      confirm: async (name) => {
        if (name === collection) return;
        try {
          await window.api.adminSession(connection.id, {
            kind: 'renameCollection',
            database,
            collection,
            newName: name
          });
          if (
            selection !== null &&
            selection.kind === 'collection' &&
            selection.connectionId === connection.id &&
            selection.database === database &&
            selection.collection === collection
          ) {
            setSelection({ ...selection, collection: name });
          }
          await refreshCollections(connection.id, database);
        } catch (err) {
          setError(messageOf(err));
        }
      }
    });
  }

  function promptDuplicateCollection(
    connection: ConnectionConfig,
    database: string,
    collection: string
  ) {
    setPrompt({
      title: 'Duplicate collection',
      label: 'Duplicate as',
      initial: collection + '_copy',
      confirmLabel: 'Duplicate',
      confirm: async (name) => {
        if (name === collection) return;
        try {
          await window.api.adminSession(connection.id, {
            kind: 'duplicateCollection',
            database,
            collection,
            newName: name
          });
          await refreshCollections(connection.id, database);
        } catch (err) {
          setError(messageOf(err));
        }
      }
    });
  }

  function confirmClearCollection(
    connection: ConnectionConfig,
    database: string,
    collection: string
  ) {
    setConfirm({
      title: 'Clear collection',
      message: `Delete ALL documents in "${collection}"? This cannot be undone.`,
      confirmLabel: 'Clear',
      confirm: async () => {
        try {
          await window.api.adminSession(connection.id, {
            kind: 'clearCollection',
            database,
            collection
          });
          setError(null);
        } catch (err) {
          setError(messageOf(err));
        }
      }
    });
  }

  function confirmDropCollection(
    connection: ConnectionConfig,
    database: string,
    collection: string
  ) {
    setConfirm({
      title: 'Drop collection',
      message: `Drop collection "${collection}"? This cannot be undone.`,
      confirmLabel: 'Drop',
      confirm: async () => {
        try {
          await window.api.adminSession(connection.id, {
            kind: 'dropCollection',
            database,
            collection
          });
          setSelection(null);
          await refreshCollections(connection.id, database);
        } catch (err) {
          setError(messageOf(err));
        }
      }
    });
  }

  function confirmDropDatabase(connection: ConnectionConfig, database: string) {
    setConfirm({
      title: 'Drop database',
      message: `Drop database "${database}"? All of its collections and data will be deleted.`,
      confirmLabel: 'Drop',
      confirm: async () => {
        try {
          await window.api.adminSession(connection.id, { kind: 'dropDatabase', database });
          setSelection(null);
          dispatch({ type: 'session/databaseRemoved', connectionId: connection.id, database });
        } catch (err) {
          setError(messageOf(err));
        }
      }
    });
  }

  function openDatabaseMenu(
    event: ReactMouseEvent,
    connection: ConnectionConfig,
    database: string
  ) {
    event.preventDefault();
    event.stopPropagation();
    setSelection({ kind: 'database', connectionId: connection.id, database });
    setMenu({ kind: 'database', x: event.clientX, y: event.clientY, connection, database });
  }

  function openCollectionMenu(
    event: ReactMouseEvent,
    connection: ConnectionConfig,
    database: string,
    collection: string
  ) {
    event.preventDefault();
    event.stopPropagation();
    setSelection({ kind: 'collection', connectionId: connection.id, database, collection });
    setMenu({ kind: 'collection', x: event.clientX, y: event.clientY, connection, database, collection });
  }

  function closeMenu() {
    setMenu(null);
  }

  return (
    <aside
      style={{ width }}
      className={`relative flex h-full shrink-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900${dragging ? ' select-none' : ''}`}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={handleResizeMouseDown}
        className="absolute inset-y-0 -right-0.5 z-10 w-1 cursor-col-resize hover:bg-emerald-500/40"
      />
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-200 px-3 dark:border-slate-800">
        <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          NexDB
        </span>
        <button
          type="button"
          onClick={onManageOpen}
          className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-500"
          aria-label="Manage connections"
        >
          Connect
        </button>
      </div>
      <ManageConnectionsPopup
        open={manageOpen}
        onClose={onManageClose}
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
                    const dbSelected =
                      selection !== null &&
                      selection.kind === 'database' &&
                      selection.connectionId === connection.id &&
                      selection.database === database;
                    return (
                      <div key={database}>
                        <div className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-sm text-slate-700 dark:text-slate-300${dbSelected ? ` ${SELECTED_CLASS}` : ''}`}>
                        <button
                          type="button"
                          onClick={() => void handleToggle(connection.id, database, session)}
                          className="shrink-0 text-slate-400 dark:text-slate-500"
                          aria-label={expanded ? `Collapse ${database}` : `Expand ${database}`}
                        >
                          {expanded ? (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          ) : (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
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
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSelection({ kind: 'database', connectionId: connection.id, database })
                          }
                          onDoubleClick={() => void handleToggle(connection.id, database, session)}
                          onContextMenu={(event) => openDatabaseMenu(event, connection, database)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="min-w-0 flex-1 truncate">{database}</span>
                        </button>
                        </div>
                        {expanded ? (
                          <div>
                            {collections === undefined || collections === 'loading' ? (
                              <p className="px-1 py-0.5 text-xs text-slate-500 dark:text-slate-400">
                                Loading…
                              </p>
                            ) : collections.length === 0 ? (
                              <p className="px-1 py-0.5 text-xs text-slate-500 dark:text-slate-400">
                                No collections
                              </p>
                            ) : (
                              collections.slice().sort().map((collection) => {
                                const collectionSelected =
                                  selection !== null &&
                                  selection.kind === 'collection' &&
                                  selection.connectionId === connection.id &&
                                  selection.database === database &&
                                  selection.collection === collection;
                                return (
                                  <button
                                    key={collection}
                                    type="button"
                                    onClick={() =>
                                      setSelection({
                                        kind: 'collection',
                                        connectionId: connection.id,
                                        database,
                                        collection
                                      })
                                    }
                                    onDoubleClick={() =>
                                      void handleOpenCollection(connection, database, collection)
                                    }
                                    onContextMenu={(event) =>
                                      openCollectionMenu(event, connection, database, collection)
                                    }
                                    className={`block pl-8 w-full truncate rounded px-1 py-0.5 text-left text-sm text-slate-700 dark:text-slate-300${collectionSelected ? ` ${SELECTED_CLASS}` : ''}`}
                                  >
                                    {collection}
                                  </button>
                                );
                              })
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
      {menu !== null ? (
        <div
          ref={menuRef}
          style={{ left: menu.x, top: menu.y }}
          className="fixed z-50 min-w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {menu.kind === 'database' ? (
            <>
              <button
                type="button"
                className={MENU_ITEM_CLASS}
                onClick={() => {
                  void handleToggle(
                    menu.connection.id,
                    menu.database,
                    state.sessions[menu.connection.id] ?? emptySession()
                  );
                  closeMenu();
                }}
              >
                <span>
                  {state.sessions[menu.connection.id]?.expanded[menu.database] ?? false
                    ? 'Collapse'
                    : 'Expand'}
                </span>
              </button>
              <button
                type="button"
                className={MENU_ITEM_CLASS}
                onClick={() => {
                  copyName(menu.database);
                  closeMenu();
                }}
              >
                <span>Copy name</span>
              </button>
              <button
                type="button"
                className={MENU_ITEM_CLASS}
                onClick={() => {
                  promptAddCollection(menu.connection, menu.database);
                  closeMenu();
                }}
              >
                <span>Add collection…</span>
              </button>
              <div className={MENU_SEPARATOR_CLASS} />
              <button
                type="button"
                className={MENU_DANGER_CLASS}
                onClick={() => {
                  confirmDropDatabase(menu.connection, menu.database);
                  closeMenu();
                }}
              >
                <span>Drop database…</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={MENU_ITEM_CLASS}
                onClick={() => {
                  void handleOpenCollection(menu.connection, menu.database, menu.collection);
                  closeMenu();
                }}
              >
                <span>Open</span>
              </button>
              <button
                type="button"
                className={MENU_ITEM_CLASS}
                onClick={() => {
                  copyName(menu.collection);
                  closeMenu();
                }}
              >
                <span>Copy name</span>
              </button>
              <button
                type="button"
                className={MENU_ITEM_CLASS}
                onClick={() => {
                  promptRenameCollection(menu.connection, menu.database, menu.collection);
                  closeMenu();
                }}
              >
                <span>Rename collection…</span>
              </button>
              <button
                type="button"
                className={MENU_ITEM_CLASS}
                onClick={() => {
                  promptDuplicateCollection(menu.connection, menu.database, menu.collection);
                  closeMenu();
                }}
              >
                <span>Duplicate collection…</span>
              </button>
              <div className={MENU_SEPARATOR_CLASS} />
              <button
                type="button"
                className={MENU_ITEM_CLASS}
                onClick={() => {
                  confirmClearCollection(menu.connection, menu.database, menu.collection);
                  closeMenu();
                }}
              >
                <span>Clear collection…</span>
              </button>
              <button
                type="button"
                className={MENU_DANGER_CLASS}
                onClick={() => {
                  confirmDropCollection(menu.connection, menu.database, menu.collection);
                  closeMenu();
                }}
              >
                <span>Drop collection…</span>
              </button>
            </>
          )}
        </div>
      ) : null}
      <PromptDialog
        open={prompt !== null}
        title={prompt?.title ?? ''}
        label={prompt?.label ?? ''}
        initial={prompt?.initial ?? ''}
        confirmLabel={prompt?.confirmLabel ?? 'OK'}
        onConfirm={(value) => {
          void prompt?.confirm(value);
        }}
        onClose={() => setPrompt(null)}
      />
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.confirmLabel ?? 'Confirm'}
        danger
        onConfirm={() => {
          void confirm?.confirm();
        }}
        onClose={() => setConfirm(null)}
      />
    </aside>
  );
}
