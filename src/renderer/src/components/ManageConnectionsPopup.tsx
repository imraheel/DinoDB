import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useApp } from '../context/AppState';
import { emptySession } from '../context/reducer';
import { messageOf } from '../lib/errors';
import type { ConnectionConfig } from '../../../shared/types';
import Banner from './ui/Banner';
import Button from './ui/Button';
import Menu, { MenuItem, MenuSeparator } from './ui/Menu';
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal';
import ConfirmDialog from './ConfirmDialog';

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

interface IconProps {
  size?: number;
}

function PlusIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 16v6" />
      <path d="M21 12.536V5" />
      <path d="M22 19h-6" />
      <path d="M3 12A9 3 0 0 0 15.1824 14.8061" />
      <path d="M3 5V19A9 3 0 0 0 13.318 21.968" />
      <ellipse cx="12" cy="5" rx="9" ry="3" />
    </svg>
  );
}

function DatabaseCheckIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m16 19 2 2 4-4" />
      <path d="M21 13.127V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
      <path d="M3 5V19A9 3 0 0 0 13.318 21.968" />
      <ellipse cx="12" cy="5" rx="9" ry="3" />
    </svg>
  );
}

function DatabaseXIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m17 17 5 5" />
      <path d="M19.323 13.744A9 3 0 0 0 21 12" />
      <path d="M21 13.127V5" />
      <path d="m22 17-5 5" />
      <path d="M3 12A9 3 0 0 0 13.563 14.954" />
      <path d="M3 5V19A9 3 0 0 0 13 21.981" />
      <ellipse cx="12" cy="5" rx="9" ry="3" />
    </svg>
  );
}

function PencilIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function DuplicateIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function TrashIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

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

  const allConnections = state.connections;
  const selected =
    selectedId === null ? null : (allConnections.find((c) => c.id === selectedId) ?? null);
  const selectedConnected =
    selected !== null && state.sessions[selected.id]?.status === 'connected';

  function closeAndReset() {
    onClose();
    setSelectedId(null);
  }

  function openRowMenu(
    event: ReactMouseEvent,
    connection: ConnectionConfig,
    connected: boolean
  ) {
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

  async function handleDisconnect(connection: ConnectionConfig) {
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
    <Modal open={open} onClose={closeAndReset} className="max-w-3xl" aria-label="Connection Manager">
      <ModalHeader title="Connection Manager" />
      <ModalBody className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <button type="button" onClick={onAdd} className={ICON_BUTTON_CLASS} aria-label="New connection">
            <PlusIcon />
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
            <PencilIcon />
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
            <DuplicateIcon />
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
            <TrashIcon />
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
                  <th className="px-2 py-1.5 text-caption font-medium text-label-secondary">Name</th>
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
            icon={
              rowMenu.connected ? <DatabaseXIcon size={14} /> : <DatabaseCheckIcon size={14} />
            }
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
            icon={<DuplicateIcon size={14} />}
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
    </Modal>
  );
}
