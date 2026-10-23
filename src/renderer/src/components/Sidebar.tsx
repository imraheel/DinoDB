import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useApp } from '../context/AppState';
import { emptySession, type SessionState } from '../context/reducer';
import { messageOf } from '../lib/errors';
import type { ConnectionConfig } from '../../../shared/types';
import Banner from './ui/Banner';
import Button from './ui/Button';
import Menu, { MenuItem, MenuSeparator } from './ui/Menu';
import ConfirmDialog from './ConfirmDialog';
import ManageConnectionsPopup from './ManageConnectionsPopup';
import PromptDialog from './PromptDialog';

interface SidebarProps {
  collapsed: boolean;
  onAdd: () => void;
  onEdit: (connection: ConnectionConfig) => void;
  manageOpen: boolean;
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

const SELECTED_CLASS = 'bg-accent text-white';

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
  collapsed,
  onAdd,
  onEdit,
  manageOpen,
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
  const [filterText, setFilterText] = useState('');
  const prefetchingRef = useRef<Set<string>>(new Set());
  const filter = filterText.trim().toLowerCase();

  useEffect(() => {
    if (collapsed) setMenu(null);
  }, [collapsed]);

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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(null);
        setSelection(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menu]);

  const allConnections = state.connections;
  const connectedConnections = allConnections.filter(
    (c: ConnectionConfig) => state.sessions[c.id]?.status === 'connected'
  );

  useEffect(() => {
    if (filter === '') {
      prefetchingRef.current.clear();
      return;
    }
    for (const connection of connectedConnections) {
      const session = state.sessions[connection.id] ?? emptySession();
      for (const database of session.databases) {
        if (session.collections[database] !== undefined) continue;
        const key = connection.id + ':' + database;
        if (prefetchingRef.current.has(key)) continue;
        prefetchingRef.current.add(key);
        void window.api
          .listCollections(connection.id, database)
          .then(({ collections }) =>
            dispatch({
              type: 'session/collections',
              connectionId: connection.id,
              database,
              collections
            })
          )
          .catch(() => {
            dispatch({
              type: 'session/collections',
              connectionId: connection.id,
              database,
              collections: []
            });
          })
          .finally(() => {
            prefetchingRef.current.delete(key);
          });
      }
    }
  }, [filter, connectedConnections, state.sessions, dispatch]);

  function closeConnectionTabs(connectionId: string) {
    for (const tab of state.tabs) {
      if (tab.connectionId !== connectionId) continue;
      dispatch({ type: 'tab/removed', tabId: tab.id });
      void window.api.closeTab(tab.id).catch(() => {});
    }
  }

  function handleDisconnect(connection: ConnectionConfig) {
    const tabCount = state.tabs.filter((tab) => tab.connectionId === connection.id).length;
    if (tabCount === 0) {
      void disconnectNow(connection);
      return;
    }
    setConfirm({
      title: `Disconnect "${connection.name}"?`,
      message: `${tabCount === 1 ? '1 open tab' : `${tabCount} open tabs`} will be closed.`,
      confirmLabel: 'Disconnect',
      confirm: async () => {
        closeConnectionTabs(connection.id);
        await disconnectNow(connection);
      }
    });
  }

  async function disconnectNow(connection: ConnectionConfig) {
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

  async function handleOpenCollection(
    connection: ConnectionConfig,
    database: string,
    collection: string
  ) {
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

  async function handleViewIndexes(
    connection: ConnectionConfig,
    database: string,
    collection: string
  ) {
    try {
      const { tabId } = await window.api.createTab({
        connectionId: connection.id,
        database,
        collection,
        kind: 'indexes'
      });
      dispatch({
        type: 'tab/added',
        tab: {
          id: tabId,
          connectionId: connection.id,
          connectionName: connection.name,
          database,
          collection,
          kind: 'indexes',
          title: `${database}.${collection} — Indexes`
        },
        fields: []
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
    setMenu({
      kind: 'collection',
      x: event.clientX,
      y: event.clientY,
      connection,
      database,
      collection
    });
  }

  function closeMenu() {
    setMenu(null);
  }

  return (
    <aside
      style={{ width: collapsed ? 0 : width }}
      className={`relative flex h-full shrink-0 flex-col bg-sidebar${
        collapsed ? ' overflow-hidden' : ' border-r border-border'
      }${dragging ? ' select-none' : ''}`}
    >
      {collapsed ? null : (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onMouseDown={handleResizeMouseDown}
          className="window-no-drag absolute inset-y-0 -right-0.5 z-10 w-1 cursor-col-resize hover:bg-accent/40"
        />
      )}
      <div className="flex h-9 shrink-0 items-center border-b border-border px-2">
        <div className="relative w-full">
          <svg
            className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-label-tertiary"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
          >
            <circle cx="5" cy="5" r="3.5" />
            <path d="M7.5 7.5L10.5 10.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setFilterText('');
            }}
            placeholder="Search collections…"
            aria-label="Search collections"
            className="h-[26px] w-full rounded-field border border-border-strong bg-surface pr-6 pl-7 text-ui text-label shadow-[inset_0_1px_1px_rgba(0,0,0,0.04)] placeholder:text-label-tertiary focus:border-accent focus:ring-2 focus:ring-accent-ring focus:outline-none"
          />
          {filterText !== '' ? (
            <button
              type="button"
              onClick={() => setFilterText('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full text-label-tertiary hover:bg-well hover:text-label-secondary"
            >
              <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden="true">
                <path
                  d="M1.5 1.5l7 7M8.5 1.5l-7 7"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
      <ManageConnectionsPopup
        open={manageOpen}
        onClose={onManageClose}
        onAdd={onAdd}
        onEdit={onEdit}
      />
      {error !== null ? (
        <Banner onDismiss={() => setError(null)} className="border-b border-border">
          {error}
        </Banner>
      ) : null}
      <div className="flex-1 overflow-y-auto py-1">
        {connectedConnections.length === 0 ? (
          <p className="px-3 py-2 text-xs text-label-tertiary">
            No connections yet. Use &quot;Connect&quot; to add one.
          </p>
        ) : null}
        {(() => {
          const connectionBlocks = connectedConnections.map((connection: ConnectionConfig) => {
            const session = state.sessions[connection.id] ?? emptySession();
            const databaseRows = session.databases
              .map((database) => {
                const collections = session.collections[database];
                const collectionList = Array.isArray(collections) ? collections : [];
                const matchedCollections =
                  filter === ''
                    ? collectionList
                    : collectionList.filter((name) => name.toLowerCase().includes(filter));
                if (filter !== '' && matchedCollections.length === 0) return null;
                return { database, matchedCollections, collections };
              })
              .filter((row): row is NonNullable<typeof row> => row !== null);
            return { connection, session, databaseRows };
          });
          const anyMatch = connectionBlocks.some(({ databaseRows }) =>
            databaseRows.some(({ matchedCollections }) => matchedCollections.length > 0)
          );
          const blocks = connectionBlocks
            .filter(({ databaseRows }) => databaseRows.length > 0)
            .map(({ connection, session, databaseRows }) => {
              return (
                <div key={connection.id} className="group px-2 py-1 hover:bg-sidebar-hover">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        session.status === 'connected' ? 'bg-success' : 'bg-label-tertiary/40'
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-ui text-label">
                      {connection.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate pl-[13px] text-caption text-label-tertiary">
                      {connection.host}:{connection.port}
                    </span>
                    {session.status === 'connected' ? (
                      <Button
                        variant="quiet"
                        size="sm"
                        onClick={() => void handleDisconnect(connection)}
                        aria-label={`Disconnect ${connection.name}`}
                      >
                        Disconnect
                      </Button>
                    ) : null}
                  </div>
                  {session.status === 'connected' ? (
                    <div className="mt-0.5">
                      {databaseRows.map(({ database, matchedCollections, collections }) => {
                        const expanded =
                          filter !== '' ? true : (session.expanded[database] ?? false);
                        const dbSelected =
                          selection !== null &&
                          selection.kind === 'database' &&
                          selection.connectionId === connection.id &&
                          selection.database === database;
                        return (
                          <div key={database}>
                            <div
                              className={`flex w-full items-center gap-0.5 rounded-[5px] pr-1 pl-0.5 text-left text-ui${
                                dbSelected
                                  ? ` ${SELECTED_CLASS}`
                                  : ' text-label-secondary hover:bg-sidebar-hover'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => void handleToggle(connection.id, database, session)}
                                className={`flex h-5 w-5 shrink-0 items-center justify-center ${
                                  dbSelected ? 'text-white/80' : 'text-label-tertiary'
                                }`}
                                aria-label={
                                  expanded ? `Collapse ${database}` : `Expand ${database}`
                                }
                              >
                                <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
                                  {expanded ? (
                                    <polygon points="1.5,2.5 8.5,2.5 5,8" fill="currentColor" />
                                  ) : (
                                    <polygon points="2.5,1.5 8,5 2.5,8.5" fill="currentColor" />
                                  )}
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setSelection({
                                    kind: 'database',
                                    connectionId: connection.id,
                                    database
                                  })
                                }
                                onDoubleClick={() =>
                                  void handleToggle(connection.id, database, session)
                                }
                                onContextMenu={(event) =>
                                  openDatabaseMenu(event, connection, database)
                                }
                                className="min-w-0 flex-1 text-left"
                              >
                                <span className="min-w-0 flex-1 truncate">{database}</span>
                              </button>
                            </div>
                            {expanded ? (
                              <div>
                                {collections === undefined || collections === 'loading' ? (
                                  <p className="px-1 py-0.5 text-caption text-label-tertiary">
                                    Loading…
                                  </p>
                                ) : collections.length === 0 ? (
                                  <p className="px-1 py-0.5 text-caption text-label-tertiary">
                                    No collections
                                  </p>
                                ) : (
                                  (filter !== '' ? matchedCollections : collections)
                                    .slice()
                                    .sort()
                                    .map((collection) => {
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
                                            void handleOpenCollection(
                                              connection,
                                              database,
                                              collection
                                            )
                                          }
                                          onContextMenu={(event) =>
                                            openCollectionMenu(
                                              event,
                                              connection,
                                              database,
                                              collection
                                            )
                                          }
                                          className={`block w-full truncate rounded-[5px] py-[3px] pr-1 pl-7 text-left text-ui${
                                            collectionSelected
                                              ? ` ${SELECTED_CLASS}`
                                              : ' text-label-secondary hover:bg-sidebar-hover'
                                          }`}
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
            });
          return (
            <>
              {blocks}
              {filter !== '' && !anyMatch ? (
                <p className="px-3 py-2 text-xs text-label-tertiary">No matches</p>
              ) : null}
            </>
          );
        })()}
      </div>
      {menu !== null ? (
        <Menu x={menu.x} y={menu.y} onClose={closeMenu}>
          {menu.kind === 'database' ? (
            <>
              <MenuItem
                onClick={() => {
                  void handleToggle(
                    menu.connection.id,
                    menu.database,
                    state.sessions[menu.connection.id] ?? emptySession()
                  );
                  closeMenu();
                }}
              >
                {(state.sessions[menu.connection.id]?.expanded[menu.database] ?? false)
                  ? 'Collapse'
                  : 'Expand'}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  copyName(menu.database);
                  closeMenu();
                }}
              >
                Copy name
              </MenuItem>
              <MenuItem
                onClick={() => {
                  promptAddCollection(menu.connection, menu.database);
                  closeMenu();
                }}
              >
                Add collection…
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                danger
                onClick={() => {
                  confirmDropDatabase(menu.connection, menu.database);
                  closeMenu();
                }}
              >
                Drop database…
              </MenuItem>
            </>
          ) : (
            <>
              <MenuItem
                onClick={() => {
                  void handleOpenCollection(menu.connection, menu.database, menu.collection);
                  closeMenu();
                }}
              >
                Open
              </MenuItem>
              <MenuItem
                onClick={() => {
                  void handleViewIndexes(menu.connection, menu.database, menu.collection);
                  closeMenu();
                }}
              >
                View Indexes…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  copyName(menu.collection);
                  closeMenu();
                }}
              >
                Copy name
              </MenuItem>
              <MenuItem
                onClick={() => {
                  promptRenameCollection(menu.connection, menu.database, menu.collection);
                  closeMenu();
                }}
              >
                Rename collection…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  promptDuplicateCollection(menu.connection, menu.database, menu.collection);
                  closeMenu();
                }}
              >
                Duplicate collection…
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                onClick={() => {
                  confirmClearCollection(menu.connection, menu.database, menu.collection);
                  closeMenu();
                }}
              >
                Clear collection…
              </MenuItem>
              <MenuItem
                danger
                onClick={() => {
                  confirmDropCollection(menu.connection, menu.database, menu.collection);
                  closeMenu();
                }}
              >
                Drop collection…
              </MenuItem>
            </>
          )}
        </Menu>
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
