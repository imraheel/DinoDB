import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useApp } from '../../context/AppState';
import { emptySession } from '../../context/reducer';
import { messageOf } from '../../lib/errors';
import type { ConnectionConfig } from '../../../../shared/types';
import Banner from '../ui/Banner';
import Button from '../ui/Button';
import Menu, { MenuItem, MenuSeparator } from '../ui/Menu';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import {
  CopyIcon,
  DatabaseCheckIcon,
  DatabasePlusIcon,
  DatabaseXIcon,
  PencilIcon,
  TrashIcon
} from 'lucide-react';

interface ManageConnectionsPopupProps {
  open: boolean;
  onClose(): void;
  onAdd(): void;
  onEdit(connection: ConnectionConfig): void;
}

interface RowMenuState {
  x: number;
  y: number;
  connection: ConnectionConfig;
  connected: boolean;
}

const ICON_BUTTON_CLASS =
  'flex flex-col items-center gap-1 rounded-control px-3 py-2 text-label-secondary transition-colors duration-100 hover:bg-well disabled:cursor-not-allowed disabled:opacity-40';
const ICON_LABEL_CLASS = 'text-caption font-medium';

export default function ManageConnectionsPopup({
  open,
  onClose,
  onAdd,
  onEdit
}: ManageConnectionsPopupProps) {
  const { state, dispatch } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<RowMenuState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ConnectionConfig | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<ConnectionConfig | null>(null);

  const pendingDisconnectTabCount =
    pendingDisconnect === null
      ? 0
      : state.tabs.filter((tab) => tab.connectionId === pendingDisconnect.id).length;

  const allConnections = state.connections;
  const selected =
    selectedId === null ? null : (allConnections.find((c) => c.id === selectedId) ?? null);
  const selectedConnected =
    selected !== null && state.sessions[selected.id]?.status === 'connected';

  function closeAndReset() {
    onClose();
    setSelectedId(null);
  }

  function openRowMenu(event: ReactMouseEvent, connection: ConnectionConfig, connected: boolean) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(connection.id);
    setRowMenu({ x: event.clientX, y: event.clientY, connection, connected });
  }

  function handleMenuItem(action: () => void) {
    return () => {
      setRowMenu(null);
      action();
    };
  }

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
      const connections = await window.api.listConnections();
      dispatch({ type: 'connections/loaded', connections });
      setSelectedId(null);
      onClose();
    } catch (err) {
      const message = messageOf(err);
      dispatch({ type: 'session/errored', connectionId: connection.id, error: message });
      setError(message);
    }
  }

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
    setPendingDisconnect(connection);
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

  async function handleDelete(connection: ConnectionConfig) {
    try {
      await window.api.deleteConnection(connection.id);
      dispatch({ type: 'connections/removed', id: connection.id });
      if (selectedId === connection.id) setSelectedId(null);
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function handleDuplicate(connection: ConnectionConfig) {
    try {
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = connection;
      const saved = await window.api.saveConnection({
        ...input,
        name: connection.name + ' copy'
      });
      dispatch({ type: 'connections/upserted', connection: saved });
      setSelectedId(saved.id);
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <Modal
      open={open}
      onClose={closeAndReset}
      className="max-w-3xl"
      aria-label="Connection Manager"
    >
      <ModalHeader title="Connection Manager" />
      <ModalBody className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={onAdd}
            className={ICON_BUTTON_CLASS}
            aria-label="New connection"
          >
            <DatabasePlusIcon size={20} />
            <span className={ICON_LABEL_CLASS}>New</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (selected !== null) onEdit(selected);
            }}
            disabled={selected === null}
            className={ICON_BUTTON_CLASS}
            aria-label="Edit connection"
          >
            <PencilIcon size={20} />
            <span className={ICON_LABEL_CLASS}>Edit</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (selected !== null) void handleDuplicate(selected);
            }}
            disabled={selected === null}
            className={ICON_BUTTON_CLASS}
            aria-label="Duplicate connection"
          >
            <CopyIcon size={20} />
            <span className={ICON_LABEL_CLASS}>Duplicate</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (selected !== null) setPendingDelete(selected);
            }}
            disabled={selected === null}
            className={ICON_BUTTON_CLASS}
            aria-label="Delete connection"
          >
            <TrashIcon size={20} />
            <span className={ICON_LABEL_CLASS}>Delete</span>
          </button>
        </div>

        {error !== null ? (
          <Banner tone="error" className="rounded-field border border-border">
            {error}
          </Banner>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {allConnections.length > 0 ? (
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-1.5 text-caption font-medium text-label-secondary">
                    Name
                  </th>
                  <th className="px-2 py-1.5 text-caption font-medium text-label-secondary">
                    Host:Port
                  </th>
                  <th className="px-2 py-1.5 text-caption font-medium text-label-secondary">
                    Last connected
                  </th>
                  <th className="px-2 py-1.5 text-caption font-medium text-label-secondary">
                    Last modified
                  </th>
                </tr>
              </thead>
              <tbody>
                {allConnections.map((connection: ConnectionConfig) => {
                  const session = state.sessions[connection.id] ?? emptySession();
                  const isConnected = session.status === 'connected';
                  const isSelected = selectedId === connection.id;
                  return (
                    <tr
                      key={connection.id}
                      onClick={() => setSelectedId(connection.id)}
                      onDoubleClick={() => {
                        if (!isConnected) void handleConnect(connection);
                      }}
                      onContextMenu={(event) => openRowMenu(event, connection, isConnected)}
                      className={
                        isSelected
                          ? 'cursor-default border-b border-border bg-accent-soft text-label'
                          : 'cursor-default border-b border-border text-label last:border-0 hover:bg-well'
                      }
                    >
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              isConnected
                                ? 'h-1.5 w-1.5 shrink-0 rounded-full bg-success'
                                : 'h-1.5 w-1.5 shrink-0 rounded-full bg-label-tertiary/40'
                            }
                            aria-label={isConnected ? 'Connected' : 'Disconnected'}
                          />
                          <span className="font-medium">{connection.name}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-xs text-label-secondary">
                        {connection.host}:{connection.port}
                      </td>
                      <td className="px-2 py-2 text-xs text-label-tertiary">
                        {connection.lastConnectedAt === null
                          ? 'never'
                          : formatTime(connection.lastConnectedAt)}
                      </td>
                      <td className="px-2 py-2 text-xs text-label-tertiary">
                        {formatTime(connection.updatedAt ?? connection.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="py-6 text-center text-xs text-label-tertiary">No saved connections</p>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button size="md" onClick={closeAndReset}>
          Close
        </Button>
        <Button
          variant="primary"
          size="md"
          className="px-4"
          disabled={selected === null}
          onClick={() => {
            if (selected === null) return;
            if (selectedConnected) void handleDisconnect(selected);
            else void handleConnect(selected);
          }}
        >
          {selectedConnected ? 'Disconnect' : 'Connect'}
        </Button>
      </ModalFooter>

      {rowMenu !== null ? (
        <Menu x={rowMenu.x} y={rowMenu.y} onClose={() => setRowMenu(null)}>
          <MenuItem
            icon={rowMenu.connected ? <DatabaseXIcon size={14} /> : <DatabaseCheckIcon size={14} />}
            onClick={handleMenuItem(() => {
              if (rowMenu.connected) void handleDisconnect(rowMenu.connection);
              else void handleConnect(rowMenu.connection);
            })}
          >
            {rowMenu.connected ? 'Disconnect' : 'Connect'}
          </MenuItem>
          <MenuItem
            icon={<PencilIcon size={14} />}
            onClick={handleMenuItem(() => onEdit(rowMenu.connection))}
          >
            Edit
          </MenuItem>
          <MenuItem
            icon={<CopyIcon size={14} />}
            onClick={handleMenuItem(() => void handleDuplicate(rowMenu.connection))}
          >
            Duplicate
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            danger
            icon={<TrashIcon size={14} />}
            onClick={handleMenuItem(() => setPendingDelete(rowMenu.connection))}
          >
            Delete
          </MenuItem>
        </Menu>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete connection"
        message={
          pendingDelete === null
            ? ''
            : `Delete connection "${pendingDelete.name}"? This cannot be undone.`
        }
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (pendingDelete === null) return;
          void handleDelete(pendingDelete);
        }}
        onClose={() => setPendingDelete(null)}
      />
      <ConfirmDialog
        open={pendingDisconnect !== null}
        title={pendingDisconnect === null ? '' : `Disconnect "${pendingDisconnect.name}"?`}
        message={
          pendingDisconnect === null
            ? ''
            : `${pendingDisconnectTabCount === 1 ? '1 open tab' : `${pendingDisconnectTabCount} open tabs`} will be closed.`
        }
        confirmLabel="Disconnect"
        danger
        onConfirm={() => {
          if (pendingDisconnect === null) return;
          closeConnectionTabs(pendingDisconnect.id);
          void disconnectNow(pendingDisconnect);
        }}
        onClose={() => setPendingDisconnect(null)}
      />
    </Modal>
  );
}
