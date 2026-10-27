import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
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
  canExportQuery?: boolean;
  onExport?(documents?: unknown[]): void;
  onInsert?(): void;
  onView?(doc: unknown): void;
  onEdit?(doc: unknown): void;
  onDelete?(docs: unknown[]): void;
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

function hasModifier(event: MouseEvent | ReactMouseEvent): boolean {
  return IS_MAC ? event.metaKey : event.ctrlKey;
}

export default function DataTable({
  fields,
  documents,
  truncated,
  loading,
  readOnly,
  active,
  canExportQuery,
  onExport,
  onInsert,
  onView,
  onEdit,
  onDelete,
  onRefresh
}: DataTableProps) {
  const columns = documents.length > 0 ? getColumns([], documents) : getColumns(fields, []);
  const keys = useMemo(
    () => documents.map((document, index) => rowKey(document, index)),
    [documents]
  );
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const anchorKeyRef = useRef<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ key: string; column: string } | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [exportMenu, setExportMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setSelectedKeys((previous) => {
      const keySet = new Set(keys);
      const next = new Set([...previous].filter((key) => keySet.has(key)));
      return next.size === previous.size ? previous : next;
    });
    setSelectedCell(null);
    anchorKeyRef.current = null;
  }, [documents, keys]);

  const selectedDocs = useMemo(
    () => documents.filter((document, index) => selectedKeys.has(rowKey(document, index))),
    [documents, selectedKeys]
  );
  const singleSelectedDoc = selectedDocs.length === 1 ? selectedDocs[0] : null;
  const canMutate = !readOnly;

  function selectOnly(key: string) {
    setSelectedKeys(new Set([key]));
    anchorKeyRef.current = key;
  }

  function toggleKey(key: string) {
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    anchorKeyRef.current = key;
  }

  function selectRange(key: string) {
    const anchor = anchorKeyRef.current;
    if (anchor === null) {
      selectOnly(key);
      return;
    }
    const anchorIndex = keys.indexOf(anchor);
    const keyIndex = keys.indexOf(key);
    if (anchorIndex === -1 || keyIndex === -1) {
      selectOnly(key);
      return;
    }
    const [from, to] = anchorIndex <= keyIndex ? [anchorIndex, keyIndex] : [keyIndex, anchorIndex];
    setSelectedKeys(new Set(keys.slice(from, to + 1)));
  }

  function handleRowClick(event: ReactMouseEvent, key: string) {
    if (hasModifier(event)) {
      toggleKey(key);
      return;
    }
    if (event.shiftKey) {
      selectRange(key);
      return;
    }
    selectOnly(key);
    setSelectedCell(null);
  }

  useEffect(() => {
    if (!active) return;

    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.closest('input, textarea, select, [contenteditable="true"], .monaco-editor') !== null
      );
    }

    function rowValuesAsText(doc: unknown): string {
      if (!isRecord(doc)) return '';
      return columns.map((column) => formatCell(doc[column])).join('\t');
    }

    function docsAsJson(docs: unknown[]): string {
      return JSON.stringify(docs.length === 1 ? docs[0] : docs, null, 2);
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
        if (singleSelectedDoc !== null && onView !== undefined) {
          event.preventDefault();
          onView(singleSelectedDoc);
        }
        return;
      }
      if (modifier && !event.shiftKey && !event.altKey && key === 'j') {
        if (canMutate && singleSelectedDoc !== null && onEdit !== undefined) {
          event.preventDefault();
          onEdit(singleSelectedDoc);
        }
        return;
      }
      if (event.shiftKey && (event.key === 'Backspace' || event.key === 'Delete')) {
        if (canMutate && selectedDocs.length > 0 && onDelete !== undefined) {
          event.preventDefault();
          onDelete(selectedDocs);
        }
        return;
      }
      if (modifier && event.shiftKey && !event.altKey && key === 'c') {
        if (selectedDocs.length > 0) {
          event.preventDefault();
          copyToClipboard(docsAsJson(selectedDocs));
        }
        return;
      }
      if (modifier && !event.shiftKey && !event.altKey && key === 'c') {
        if (selectedCell !== null && singleSelectedDoc !== null && isRecord(singleSelectedDoc)) {
          event.preventDefault();
          copyToClipboard(formatCell(singleSelectedDoc[selectedCell.column]));
          return;
        }
        if (selectedDocs.length === 1) {
          event.preventDefault();
          copyToClipboard(rowValuesAsText(selectedDocs[0]));
          return;
        }
        if (selectedDocs.length > 1) {
          event.preventDefault();
          copyToClipboard(selectedDocs.map((doc) => rowValuesAsText(doc)).join('\n'));
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    active,
    columns,
    selectedDocs,
    singleSelectedDoc,
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
    if (!selectedKeys.has(key)) selectOnly(key);
    else anchorKeyRef.current = key;
    const target = event.target as HTMLElement;
    const cell = target.closest('td');
    const column = cell?.getAttribute('data-column') ?? null;
    setSelectedCell(column !== null ? { key, column } : null);
    setMenu({ x: event.clientX, y: event.clientY, doc: document, column });
  }

  function openBackgroundMenu(event: ReactMouseEvent) {
    event.preventDefault();
    setSelectedKeys(new Set());
    setSelectedCell(null);
    anchorKeyRef.current = null;
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
  const menuDocIndex = menuDoc !== null ? documents.indexOf(menuDoc) : -1;
  const menuDocKey = menuDoc !== null && menuDocIndex !== -1 ? rowKey(menuDoc, menuDocIndex) : null;
  const menuInSelection = menuDocKey !== null && selectedKeys.has(menuDocKey);
  const multiCount = menuInSelection ? selectedDocs.length : menuDoc !== null ? 1 : 0;
  const isMulti = multiCount > 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 pb-1.5">
        <span className="text-xs text-label-secondary">{documents.length} documents</span>
        {selectedKeys.size > 0 ? (
          <span className="text-caption text-accent">{selectedKeys.size} selected</span>
        ) : null}
        {truncated ? (
          <span className="text-caption text-label-tertiary">
            Showing first {documents.length} — narrow your query
          </span>
        ) : null}
        <span className="flex-1" />
        {onExport !== undefined ? (
          <Button
            size="sm"
            disabled={loading}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setExportMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
          >
            Export…
          </Button>
        ) : null}
        {canMutate && onInsert !== undefined ? (
          <Button variant="accentOutline" size="sm" onClick={onInsert}>
            Insert document
          </Button>
        ) : null}
      </div>
      {exportMenu !== null ? (
        <Menu x={exportMenu.x} y={exportMenu.y} onClose={() => setExportMenu(null)}>
          <MenuItem
            disabled={selectedDocs.length === 0}
            onClick={() => {
              onExport?.(selectedDocs);
              setExportMenu(null);
            }}
          >
            Export selected rows…
          </MenuItem>
          <MenuItem
            disabled={!canExportQuery}
            onClick={() => {
              onExport?.();
              setExportMenu(null);
            }}
          >
            Export all query results…
          </MenuItem>
        </Menu>
      ) : null}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-auto rounded-field border border-border"
        onContextMenu={openBackgroundMenu}
      >
        {documents.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-label-tertiary">
            {loading ? 'Loading…' : 'No documents match this query.'}
          </p>
        ) : (
          <table className="w-full text-[length:var(--dt-font-size,12px)] [font-family:var(--font-code,ui-monospace)]">
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
                const selected = selectedKeys.has(key);
                const cellSelectedRow = selectedCell !== null && selectedCell.key === key;
                return (
                  <tr
                    key={key}
                    onContextMenu={(event) => openRowMenu(event, document, index)}
                    onClick={(event) => handleRowClick(event, key)}
                    onDoubleClick={() => {
                      if (onView !== undefined) onView(document);
                    }}
                    className={
                      selected
                        ? 'cursor-default bg-accent text-white'
                        : 'cursor-default text-label hover:bg-well'
                    }
                  >
                    {columns.map((column) => {
                      const raw = isRecord(document) ? document[column] : undefined;
                      const text = displayCell(document, column);
                      const cellSelected = cellSelectedRow && selectedCell?.column === column;
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
                            handleRowClick(event, key);
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
          {menuDoc !== null && isMulti ? null : menuDoc !== null && onView !== undefined ? (
            <MenuItem shortcut="F3" onClick={handleMenuItem(() => onView(menuDoc))}>
              View document
            </MenuItem>
          ) : null}
          {menuDoc !== null && isMulti ? null : menuDoc !== null &&
            canMutate &&
            onEdit !== undefined ? (
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
              onClick={handleMenuItem(() => onDelete(menuInSelection ? selectedDocs : [menuDoc]))}
            >
              {isMulti ? `Delete ${multiCount} documents` : 'Delete document'}
            </MenuItem>
          ) : null}
          {menuDoc !== null ? (
            <>
              <MenuSeparator />
              <MenuItem
                shortcut={shortcutLabel(MOD_KEY, '⇧', 'C')}
                onClick={handleMenuItem(() =>
                  copyToClipboard(
                    JSON.stringify(menuInSelection && isMulti ? selectedDocs : menuDoc, null, 2)
                  )
                )}
              >
                {isMulti ? `Copy ${multiCount} documents` : 'Copy document'}
              </MenuItem>
              {menuColumn !== null && !isMulti ? (
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
              <MenuItem shortcut={shortcutLabel(MOD_KEY, 'R')} onClick={handleMenuItem(onRefresh)}>
                Refresh
              </MenuItem>
            </>
          ) : null}
        </Menu>
      ) : null}
    </div>
  );
}
