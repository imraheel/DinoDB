import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { formatCell, getColumns } from '../lib/format';
import type { SchemaField } from '../../../shared/types';
import Button from './ui/Button';
import Menu, { MenuItem, MenuSeparator } from './ui/Menu';

interface DataTableProps {
  fields: SchemaField[];
  documents: unknown[];
  truncated: boolean;
  loading: boolean;
  readOnly: boolean;
  active: boolean;
  onInsert?(): void;
  onView?(doc: unknown): void;
  onEdit?(doc: unknown): void;
  onDelete?(doc: unknown): void;
  onRefresh?(): void;
}

interface ContextMenuState {
  x: number;
  y: number;
  doc: unknown | null;
  column: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rowKey(document: unknown, index: number): string {
  if (isRecord(document)) {
    const id = document._id;
    if (id !== undefined) return JSON.stringify(id);
  }
  return String(index);
}

function copyToClipboard(text: string): void {
  void navigator.clipboard.writeText(text).catch(() => {});
}

const EXTENDED_JSON_KEYS = [
  '$oid',
  '$date',
  '$binary',
  '$numberDecimal',
  '$numberLong',
  '$numberInt'
];

function displayCell(doc: unknown, column: string): string {
  if (!isRecord(doc)) return '';
  const value = doc[column];
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.length} ${value.length === 1 ? 'element' : 'elements'}]`;
  }
  if (value !== null && typeof value === 'object') {
    if (isRecord(value) && EXTENDED_JSON_KEYS.some((key) => key in value)) {
      return formatCell(value);
    }
    const count = Object.keys(value).length;
    return `{${count} ${count === 1 ? 'key' : 'keys'}}`;
  }
  return formatCell(value);
}

function cellColorClass(value: unknown): string {
  if (typeof value === 'boolean') return 'text-purple-600 dark:text-purple-400';
  if (typeof value === 'string') return 'text-green-600 dark:text-green-400';
  if (Array.isArray(value)) return 'text-orange-600 dark:text-orange-400';
  if (value !== null && typeof value === 'object') {
    if (isRecord(value) && EXTENDED_JSON_KEYS.some((key) => key in value)) return '';
    return 'text-orange-600 dark:text-orange-400';
  }
  return '';
}

const IS_MAC = /Mac/i.test(navigator.userAgent);
const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl';

function shortcutLabel(...parts: string[]): string {
  return parts.join(IS_MAC ? '' : '+');
}

export default function DataTable({
  fields,
  documents,
  truncated,
  loading,
  readOnly,
  active,
  onInsert,
  onView,
  onEdit,
  onDelete,
  onRefresh
}: DataTableProps) {
  const columns = getColumns(fields, documents);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ key: string; column: string } | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const selectedDoc =
    selectedKey === null
      ? null
      : (documents.find((document, index) => rowKey(document, index) === selectedKey) ?? null);
  const canMutate = !readOnly;

  useEffect(() => {
    if (!active) return;

    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.closest('input, textarea, select, [contenteditable="true"], .monaco-editor') !==
        null
      );
    }

    function rowValuesAsText(doc: unknown): string {
      if (!isRecord(doc)) return '';
      return columns.map((column) => formatCell(doc[column])).join('\t');
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      const modifier = /Mac/i.test(navigator.userAgent) ? event.metaKey : event.ctrlKey;
      const key = event.key.toLowerCase();

      if (modifier && !event.shiftKey && !event.altKey && key === 'r') {
        if (onRefresh !== undefined) {
          event.preventDefault();
          onRefresh();
        }
        return;
      }
      if (modifier && !event.shiftKey && !event.altKey && key === 'd') {
        if (canMutate && onInsert !== undefined) {
          event.preventDefault();
          onInsert();
        }
        return;
      }
      if (event.key === 'F3') {
        if (selectedDoc !== null && onView !== undefined) {
          event.preventDefault();
          onView(selectedDoc);
        }
        return;
      }
      if (modifier && !event.shiftKey && !event.altKey && key === 'j') {
        if (canMutate && selectedDoc !== null && onEdit !== undefined) {
          event.preventDefault();
          onEdit(selectedDoc);
        }
        return;
      }
      if (event.shiftKey && (event.key === 'Backspace' || event.key === 'Delete')) {
        if (canMutate && selectedDoc !== null && onDelete !== undefined) {
          event.preventDefault();
          onDelete(selectedDoc);
        }
        return;
      }
      if (modifier && event.shiftKey && !event.altKey && key === 'c') {
        if (selectedDoc !== null) {
          event.preventDefault();
          copyToClipboard(JSON.stringify(selectedDoc, null, 2));
        }
        return;
      }
      if (modifier && !event.shiftKey && !event.altKey && key === 'c') {
        if (selectedCell !== null && selectedDoc !== null && isRecord(selectedDoc)) {
          event.preventDefault();
          copyToClipboard(formatCell(selectedDoc[selectedCell.column]));
          return;
        }
        if (selectedDoc !== null) {
          event.preventDefault();
          copyToClipboard(rowValuesAsText(selectedDoc));
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    active,
    columns,
    selectedDoc,
    selectedCell,
    canMutate,
    onInsert,
    onView,
    onEdit,
    onDelete,
    onRefresh
  ]);

  useEffect(() => {
    if (menu === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menu]);

  function openRowMenu(event: ReactMouseEvent, document: unknown, index: number) {
    event.preventDefault();
    event.stopPropagation();
    const key = rowKey(document, index);
    setSelectedKey(key);
    const target = event.target as HTMLElement;
    const cell = target.closest('td');
    const column = cell?.getAttribute('data-column') ?? null;
    setSelectedCell(column !== null ? { key, column } : null);
    setMenu({ x: event.clientX, y: event.clientY, doc: document, column });
  }

  function openBackgroundMenu(event: ReactMouseEvent) {
    event.preventDefault();
    setSelectedKey(null);
    setSelectedCell(null);
    setMenu({ x: event.clientX, y: event.clientY, doc: null, column: null });
  }

  function handleMenuItem(action: () => void) {
    return () => {
      action();
      setMenu(null);
    };
  }

  function cellRawValue(doc: unknown, column: string | null): unknown {
    if (column === null || !isRecord(doc)) return undefined;
    return doc[column];
  }

  const menuDoc = menu?.doc ?? null;
  const menuColumn = menu?.column ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 pb-1.5">
        <span className="text-xs text-label-secondary">{documents.length} documents</span>
        {truncated ? (
          <span className="text-caption text-label-tertiary">
            Showing first {documents.length} — narrow your query
          </span>
        ) : null}
        <span className="flex-1" />
        {canMutate && onInsert !== undefined ? (
          <Button
            variant="quiet"
            size="sm"
            className="border border-accent font-medium text-accent"
            onClick={onInsert}
          >
            Insert document
          </Button>
        ) : null}
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col overflow-auto rounded-field border border-border"
        onContextMenu={openBackgroundMenu}
      >
        {documents.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-label-tertiary">
            {loading ? 'Loading…' : 'No documents match this query.'}
          </p>
        ) : (
          <table className="w-full font-mono text-xs">
            <thead className="sticky top-0 z-10 bg-chrome">
              <tr className="text-left">
                {columns.map((column) => (
                  <th
                    key={column}
                    className="border-b border-border px-3 py-1.5 text-caption font-semibold text-label-secondary"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {documents.map((document, index) => {
                const key = rowKey(document, index);
                const selected = key === selectedKey;
                return (
                  <tr
                    key={key}
                    onContextMenu={(event) => openRowMenu(event, document, index)}
                    className={
                      selected
                        ? 'cursor-default bg-accent text-white'
                        : 'cursor-default text-label hover:bg-well'
                    }
                  >
                    {columns.map((column) => {
                      const raw = isRecord(document) ? document[column] : undefined;
                      const text = displayCell(document, column);
                      const cellSelected =
                        selectedCell !== null &&
                        selectedCell.key === key &&
                        selectedCell.column === column;
                      const colorClass = selected ? '' : cellColorClass(raw);
                      const baseClass =
                        'max-w-72 cursor-default truncate border-b border-border px-3 py-1.5';
                      return (
                        <td
                          key={column}
                          data-column={column}
                          title={text}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedKey(key);
                            setSelectedCell({ key, column });
                          }}
                          className={
                            cellSelected
                              ? `${baseClass} outline outline-1 -outline-offset-1 ${selected ? 'outline-white/70' : 'outline-accent'}${colorClass !== '' ? ` ${colorClass}` : ''}`
                              : `${baseClass}${colorClass !== '' ? ` ${colorClass}` : ''}`
                          }
                        >
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {loading && documents.length > 0 ? (
          <p className="px-3 py-1.5 text-xs text-label-tertiary">Refreshing…</p>
        ) : null}
      </div>
      {menu !== null ? (
        <Menu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {canMutate && onInsert !== undefined ? (
            <MenuItem shortcut={shortcutLabel(MOD_KEY, 'D')} onClick={handleMenuItem(onInsert)}>
              Insert document
            </MenuItem>
          ) : null}
          {menuDoc !== null && (canMutate || onView !== undefined) ? <MenuSeparator /> : null}
          {menuDoc !== null && onView !== undefined ? (
            <MenuItem shortcut="F3" onClick={handleMenuItem(() => onView(menuDoc))}>
              View document
            </MenuItem>
          ) : null}
          {menuDoc !== null && canMutate && onEdit !== undefined ? (
            <MenuItem
              shortcut={shortcutLabel(MOD_KEY, 'J')}
              onClick={handleMenuItem(() => onEdit(menuDoc))}
            >
              Edit document
            </MenuItem>
          ) : null}
          {menuDoc !== null && canMutate && onDelete !== undefined ? (
            <MenuItem
              danger
              shortcut="⇧⌫"
              onClick={handleMenuItem(() => onDelete(menuDoc))}
            >
              Delete document
            </MenuItem>
          ) : null}
          {menuDoc !== null ? (
            <>
              <MenuSeparator />
              <MenuItem
                shortcut={shortcutLabel(MOD_KEY, '⇧', 'C')}
                onClick={handleMenuItem(() => copyToClipboard(JSON.stringify(menuDoc, null, 2)))}
              >
                Copy document
              </MenuItem>
              {menuColumn !== null ? (
                <>
                  <MenuItem
                    onClick={handleMenuItem(() =>
                      copyToClipboard(JSON.stringify(cellRawValue(menuDoc, menuColumn)))
                    )}
                  >
                    Copy value
                  </MenuItem>
                  <MenuItem
                    shortcut={shortcutLabel(MOD_KEY, 'C')}
                    onClick={handleMenuItem(() =>
                      copyToClipboard(formatCell(cellRawValue(menuDoc, menuColumn)))
                    )}
                  >
                    Copy value as text
                  </MenuItem>
                </>
              ) : null}
            </>
          ) : null}
          {onRefresh !== undefined ? (
            <>
              <MenuSeparator />
              <MenuItem
                shortcut={shortcutLabel(MOD_KEY, 'R')}
                onClick={handleMenuItem(onRefresh)}
              >
                Refresh
              </MenuItem>
            </>
          ) : null}
        </Menu>
      ) : null}
    </div>
  );
}
