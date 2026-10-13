import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { formatCell, getColumns } from '../lib/format';
import type { SchemaField } from '../../../shared/types';

interface DataTableProps {
  fields: SchemaField[];
  documents: unknown[];
  truncated: boolean;
  loading: boolean;
  readOnly: boolean;
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

const MENU_ITEM_CLASS =
  'flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';
const MENU_DANGER_CLASS =
  'flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950';
const MENU_SEPARATOR_CLASS = 'my-1 h-px bg-slate-200 dark:bg-slate-700';
const SHORTCUT_CLASS = 'shrink-0 text-[10px] text-slate-400 dark:text-slate-500';

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
  onInsert,
  onView,
  onEdit,
  onDelete,
  onRefresh
}: DataTableProps) {
  const columns = getColumns(fields, documents);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedDoc =
    selectedKey === null
      ? null
      : (documents.find((document, index) => rowKey(document, index) === selectedKey) ?? null);
  const canMutate = !readOnly;

  useEffect(() => {
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
        if (selectedDoc !== null) {
          event.preventDefault();
          copyToClipboard(rowValuesAsText(selectedDoc));
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [columns, selectedDoc, canMutate, onInsert, onView, onEdit, onDelete, onRefresh]);

  useEffect(() => {
    if (menu === null) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current !== null && menuRef.current.contains(event.target as Node)) return;
      setMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menu]);

  function openRowMenu(event: ReactMouseEvent, document: unknown, index: number) {
    event.preventDefault();
    event.stopPropagation();
    const key = rowKey(document, index);
    setSelectedKey(key);
    const target = event.target as HTMLElement;
    const cell = target.closest('td');
    const column = cell?.getAttribute('data-column') ?? null;
    setMenu({ x: event.clientX, y: event.clientY, doc: document, column });
  }

  function openBackgroundMenu(event: ReactMouseEvent) {
    event.preventDefault();
    setSelectedKey(null);
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
        <span className="text-xs text-slate-600 dark:text-slate-300">
          {documents.length} documents
        </span>
        {truncated ? (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Showing first {documents.length} — narrow your query
          </span>
        ) : null}
        <span className="flex-1" />
        {canMutate && onInsert !== undefined ? (
          <button
            type="button"
            onClick={onInsert}
            className="shrink-0 rounded border border-emerald-600 px-2 py-0.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-950"
          >
            Insert document
          </button>
        ) : null}
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col overflow-auto rounded border border-slate-200 dark:border-slate-800"
        onContextMenu={openBackgroundMenu}
      >
        {documents.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {loading ? 'Loading…' : 'No documents match this query.'}
          </p>
        ) : (
          <table className="w-full text-sm font-mono">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
              <tr className="text-left">
                {columns.map((column) => (
                  <th
                    key={column}
                    className="border-b border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
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
                    onClick={() => setSelectedKey(key)}
                    onContextMenu={(event) => openRowMenu(event, document, index)}
                    className={
                      selected
                        ? 'cursor-default bg-emerald-50 dark:bg-emerald-950/40'
                        : 'cursor-default hover:bg-slate-50 dark:hover:bg-slate-900'
                    }
                  >
                    {columns.map((column) => {
                      const text = isRecord(document) ? formatCell(document[column]) : '';
                      return (
                        <td
                          key={column}
                          data-column={column}
                          title={text}
                          className="max-w-72 truncate border-b border-slate-100 px-3 py-1.5 dark:border-slate-800"
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
          <p className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400">Refreshing…</p>
        ) : null}
      </div>
      {menu !== null ? (
        <div
          ref={menuRef}
          style={{ left: menu.x, top: menu.y }}
          className="fixed z-50 min-w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {canMutate && onInsert !== undefined ? (
            <button type="button" className={MENU_ITEM_CLASS} onClick={handleMenuItem(onInsert)}>
              <span>Insert document</span>
              <span className={SHORTCUT_CLASS}>{shortcutLabel(MOD_KEY, 'D')}</span>
            </button>
          ) : null}
          {menuDoc !== null && (canMutate || onView !== undefined) ? (
            <div className={MENU_SEPARATOR_CLASS} />
          ) : null}
          {menuDoc !== null && onView !== undefined ? (
            <button
              type="button"
              className={MENU_ITEM_CLASS}
              onClick={handleMenuItem(() => onView(menuDoc))}
            >
              <span>View document</span>
              <span className={SHORTCUT_CLASS}>F3</span>
            </button>
          ) : null}
          {menuDoc !== null && canMutate && onEdit !== undefined ? (
            <button
              type="button"
              className={MENU_ITEM_CLASS}
              onClick={handleMenuItem(() => onEdit(menuDoc))}
            >
              <span>Edit document</span>
              <span className={SHORTCUT_CLASS}>{shortcutLabel(MOD_KEY, 'J')}</span>
            </button>
          ) : null}
          {menuDoc !== null && canMutate && onDelete !== undefined ? (
            <button
              type="button"
              className={MENU_DANGER_CLASS}
              onClick={handleMenuItem(() => onDelete(menuDoc))}
            >
              <span>Delete document</span>
              <span className={SHORTCUT_CLASS}>⇧⌫</span>
            </button>
          ) : null}
          {menuDoc !== null ? (
            <>
              <div className={MENU_SEPARATOR_CLASS} />
              <button
                type="button"
                className={MENU_ITEM_CLASS}
                onClick={handleMenuItem(() =>
                  copyToClipboard(JSON.stringify(menuDoc, null, 2))
                )}
              >
                <span>Copy document</span>
                <span className={SHORTCUT_CLASS}>{shortcutLabel(MOD_KEY, '⇧', 'C')}</span>
              </button>
              {menuColumn !== null ? (
                <>
                  <button
                    type="button"
                    className={MENU_ITEM_CLASS}
                    onClick={handleMenuItem(() =>
                      copyToClipboard(JSON.stringify(cellRawValue(menuDoc, menuColumn)))
                    )}
                  >
                    <span>Copy value</span>
                  </button>
                  <button
                    type="button"
                    className={MENU_ITEM_CLASS}
                    onClick={handleMenuItem(() =>
                      copyToClipboard(formatCell(cellRawValue(menuDoc, menuColumn)))
                    )}
                  >
                    <span>Copy value as text</span>
                    <span className={SHORTCUT_CLASS}>{shortcutLabel(MOD_KEY, 'C')}</span>
                  </button>
                </>
              ) : null}
            </>
          ) : null}
          {onRefresh !== undefined ? (
            <>
              <div className={MENU_SEPARATOR_CLASS} />
              <button type="button" className={MENU_ITEM_CLASS} onClick={handleMenuItem(onRefresh)}>
                <span>Refresh</span>
                <span className={SHORTCUT_CLASS}>{shortcutLabel(MOD_KEY, 'R')}</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
