import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useApp } from '../context/AppState';
import { openTransfer } from '../lib/transfers';
import { openDatabaseTransfer } from '../lib/database-transfers';
import { emptySession, type SessionState } from '../context/reducer';
import { messageOf } from '../lib/errors';
import type { ConnectionConfig } from '../../../shared/types';
import Banner from '../components/ui/Banner';
import Button from '../components/ui/Button';
import Menu, { MenuItem, MenuSeparator } from '../components/ui/Menu';
import ConfirmDialog from '../components/dialogs/ConfirmDialog';
import ManageConnectionsPopup from '../components/connections/ManageConnectionsPopup';
import PromptDialog from '../components/dialogs/PromptDialog';
import { ChevronDownIcon, ChevronRightIcon, SearchIcon, XIcon } from 'lucide-react';

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
  | { kind: 'connection'; x: number; y: number; connection: ConnectionConfig }
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
  secondLabel?: string;
  secondInitial?: string;
  confirm(value: string, second: string): void | Promise<void>;
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
  const [collapsedConnections, setCollapsedConnections] = useState<Record<string, boolean>>({});
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

  function toggleConnection(connectionId: string) {
    setCollapsedConnections((previous) => ({
      ...previous,
      [connectionId]: !(previous[connectionId] ?? false)
    }));
  }

  async function refreshDatabases(connectionId: string) {
    const { databases } = await window.api.connectSession(connectionId);
    dispatch({ type: 'session/connected', connectionId, databases });
    const session = state.sessions[connectionId] ?? emptySession();
    await Promise.all(
      databases
        .filter((database) => session.expanded[database] ?? false)
        .map((database) => refreshCollections(connectionId, database))
    );
  }

  function promptAddDatabase(connection: ConnectionConfig) {
    setPrompt({
      title: 'Add database',
      label: 'Database name',
      initial: '',
      secondLabel: 'First collection',
      secondInitial: '',
      confirmLabel: 'Create',
      confirm: async (database, collection) => {
        try {
          // MongoDB only persists a database once it contains a collection.
          await window.api.adminSession(connection.id, {
            kind: 'createCollection',
            database,
            name: collection
          });
          const { databases } = await window.api.connectSession(connection.id);
          dispatch({ type: 'session/connected', connectionId: connection.id, databases });
          setCollapsedConnections((previous) => ({ ...previous, [connection.id]: false }));
          const session = state.sessions[connection.id] ?? emptySession();
          if (!(session.expanded[database] ?? false)) {
            dispatch({ type: 'session/expand', connectionId: connection.id, database });
          }
          await refreshCollections(connection.id, database);
          setSelection({ kind: 'database', connectionId: connection.id, database });
          setError(null);
        } catch (err) {
          setError(messageOf(err));
        }
      }
    });
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

  async function handleOpenShell(
    connection: ConnectionConfig,
    database: string,
    collection: string
  ) {
    try {
      const { tabId } = await window.api.createTab({
        connectionId: connection.id,
        database,
        collection,
        kind: 'shell'
      });
      dispatch({
        type: 'tab/added',
        fields: [],
        tab: {
          id: tabId,
          connectionId: connection.id,
          connectionName: connection.name,
          database,
          collection,
          kind: 'shell',
          title: `${database}.${collection} — Mongosh`
        }
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

  function openConnectionMenu(event: ReactMouseEvent, connection: ConnectionConfig) {
    event.preventDefault();
    event.stopPropagation();
    setSelection(null);
    setMenu({ kind: 'connection', x: event.clientX, y: event.clientY, connection });
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
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-label-tertiary"
            size={12}
            strokeWidth={2.25}
          />
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
              <XIcon size={11} strokeWidth={2.5} />
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
            .filter(({ databaseRows }) => filter === '' || databaseRows.length > 0)
            .map(({ connection, session, databaseRows }) => {
              const connectionExpanded =
                filter !== '' || !(collapsedConnections[connection.id] ?? false);
              return (
                <div key={connection.id} className="group px-2 py-1 hover:bg-sidebar-hover">
                  <div
                    className="group/connection"
                    onContextMenu={(event) => openConnectionMenu(event, connection)}
                  >
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleConnection(connection.id)}
                        className="flex h-4 w-4 shrink-0 items-center justify-center text-label-tertiary"
                        aria-label={
                          connectionExpanded
                            ? `Collapse ${connection.name}`
                            : `Expand ${connection.name}`
                        }
                        aria-expanded={connectionExpanded}
                      >
                        {connectionExpanded ? (
                          <ChevronDownIcon size={12} strokeWidth={2.5} />
                        ) : (
                          <ChevronRightIcon size={12} strokeWidth={2.5} />
                        )}
                      </button>
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          session.status === 'connected' ? 'bg-success' : 'bg-label-tertiary/40'
                        }`}
                      />
                      <span
                        className="min-w-0 flex-1 cursor-default truncate pl-0.5 text-ui text-label"
                        onDoubleClick={() => toggleConnection(connection.id)}
                      >
                        {connection.name}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate pl-[32px] text-caption text-label-tertiary">
                        {connection.host}:{connection.port}
                      </span>
                      {session.status === 'connected' ? (
                        <Button
                          variant="quiet"
                          size="sm"
                          className="opacity-0 group-hover/connection:opacity-100 focus-visible:opacity-100"
                          onClick={() => void handleDisconnect(connection)}
                          aria-label={`Disconnect ${connection.name}`}
                        >
                          Disconnect
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {session.status === 'connected' && connectionExpanded ? (
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
                                {expanded ? (
                                  <ChevronDownIcon size={12} strokeWidth={2.5} />
                                ) : (
                                  <ChevronRightIcon size={12} strokeWidth={2.5} />
                                )}
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
          {menu.kind === 'connection' ? (
            <>
              <MenuItem
                onClick={() => {
                  toggleConnection(menu.connection.id);
                  closeMenu();
                }}
              >
                {(collapsedConnections[menu.connection.id] ?? false) ? 'Expand' : 'Collapse'}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  void refreshDatabases(menu.connection.id).catch((err: unknown) =>
                    setError(messageOf(err))
                  );
                  closeMenu();
                }}
              >
                Refresh
              </MenuItem>
              <MenuItem
                onClick={() => {
                  copyName(menu.connection.name);
                  closeMenu();
                }}
              >
                Copy name
              </MenuItem>
              <MenuItem
                onClick={() => {
                  promptAddDatabase(menu.connection);
                  closeMenu();
                }}
              >
                Add database…
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                onClick={() => {
                  onEdit(menu.connection);
                  closeMenu();
                }}
              >
                Edit connection…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  handleDisconnect(menu.connection);
                  closeMenu();
                }}
              >
                Disconnect
              </MenuItem>
            </>
          ) : menu.kind === 'database' ? (
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
                onClick={() => {
                  void openDatabaseTransfer(
                    dispatch,
                    {
                      connectionId: menu.connection.id,
                      connectionName: menu.connection.name,
                      database: menu.database
                    },
                    'database-backup'
                  ).catch((err: unknown) => setError(messageOf(err)));
                  closeMenu();
                }}
              >
                Back Up Database…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  void openDatabaseTransfer(
                    dispatch,
                    {
                      connectionId: menu.connection.id,
                      connectionName: menu.connection.name,
                      database: menu.database
                    },
                    'database-restore'
                  ).catch((err: unknown) => setError(messageOf(err)));
                  closeMenu();
                }}
              >
                Restore Database…
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
                  void handleOpenShell(menu.connection, menu.database, menu.collection);
                  closeMenu();
                }}
              >
                Open in Shell
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
                  void openTransfer(
                    dispatch,
                    {
                      connectionId: menu.connection.id,
                      connectionName: menu.connection.name,
                      database: menu.database,
                      collection: menu.collection
                    },
                    'import'
                  ).catch((err: unknown) => setError(messageOf(err)));
                  closeMenu();
                }}
              >
                Import data…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  void openTransfer(
                    dispatch,
                    {
                      connectionId: menu.connection.id,
                      connectionName: menu.connection.name,
                      database: menu.database,
                      collection: menu.collection
                    },
                    'export',
                    { kind: 'collection' }
                  ).catch((err: unknown) => setError(messageOf(err)));
                  closeMenu();
                }}
              >
                Export collection…
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
        secondLabel={prompt?.secondLabel}
        secondInitial={prompt?.secondInitial}
        onConfirm={(value, second) => {
          void prompt?.confirm(value, second);
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
