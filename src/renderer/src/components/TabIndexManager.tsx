import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { TabMeta } from '../context/reducer';
import { messageOf } from '../lib/errors';
import { formatIndexSize, indexProperties, indexTypeLabel, indexUsageLabel } from '../lib/indexes';
import { toShellJson, parseShellJson } from '../lib/shell-json';
import type { CollectionIndexInfo } from '../../../shared/ipc';
import Banner from './ui/Banner';
import Button from './ui/Button';
import Menu, { MenuItem, MenuSeparator } from './ui/Menu';
import ConfirmDialog from './ConfirmDialog';
import DocumentModal from './DocumentModal';

interface TabIndexManagerProps {
  tab: TabMeta;
  active: boolean;
}

interface IconProps {
  size?: number;
}

function RefreshCcwIcon({ size = 16 }: IconProps) {
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
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

interface IndexDraft {
  key: Record<string, unknown>;
  options: Record<string, unknown>;
}

function draftToJson(draft: IndexDraft): string {
  return toShellJson(draft);
}

function parseDraft(text: string): IndexDraft {
  const parsed: unknown = parseShellJson(text);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Index definition must be a JSON object');
  }
  const record = parsed as Record<string, unknown>;
  const key = record.key;
  if (key === null || typeof key !== 'object' || Array.isArray(key)) {
    throw new Error('Index definition requires a "key" object');
  }
  const options = record.options ?? {};
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('"options" must be an object when provided');
  }
  return { key: key as Record<string, unknown>, options: options as Record<string, unknown> };
}

const ADD_INITIAL = '{\n  "key": { "field": 1 },\n  "options": {}\n}';

export default function TabIndexManager({ tab, active }: TabIndexManagerProps) {
  const [indexes, setIndexes] = useState<CollectionIndexInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [detailsFor, setDetailsFor] = useState<CollectionIndexInfo | null>(null);
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; text: string } | null>(null);
  const [pendingDrop, setPendingDrop] = useState(false);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    index: CollectionIndexInfo | null;
  } | null>(null);

  const selectedIndex =
    selectedName === null ? null : (indexes.find((index) => index.name === selectedName) ?? null);
  const isDefaultIndex = selectedIndex !== null && selectedIndex.name === '_id_';

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.adminSession<'listIndexes'>(tab.connectionId, {
        kind: 'listIndexes',
        database: tab.database,
        collection: tab.collection
      });
      setIndexes(result.indexes);
      setSelectedName((previous) =>
        previous !== null && result.indexes.some((index) => index.name === previous)
          ? previous
          : null
      );
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [tab.connectionId, tab.database, tab.collection]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addIndex(text: string) {
    try {
      const draft = parseDraft(text);
      await window.api.adminSession<'createIndex'>(tab.connectionId, {
        kind: 'createIndex',
        database: tab.database,
        collection: tab.collection,
        key: draft.key,
        options: draft.options
      });
      setEditor(null);
      await refresh();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function editIndex(text: string) {
    if (selectedIndex === null) return;
    try {
      const draft = parseDraft(text);
      await window.api.adminSession<'dropIndex'>(tab.connectionId, {
        kind: 'dropIndex',
        database: tab.database,
        collection: tab.collection,
        name: selectedIndex.name
      });
      await window.api.adminSession<'createIndex'>(tab.connectionId, {
        kind: 'createIndex',
        database: tab.database,
        collection: tab.collection,
        key: draft.key,
        options: draft.options
      });
      setEditor(null);
      await refresh();
    } catch (err) {
      setError(messageOf(err));
      await refresh();
    }
  }

  async function dropSelected() {
    if (selectedIndex === null) return;
    try {
      await window.api.adminSession<'dropIndex'>(tab.connectionId, {
        kind: 'dropIndex',
        database: tab.database,
        collection: tab.collection,
        name: selectedIndex.name
      });
      setSelectedName(null);
      await refresh();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function toggleHidden() {
    if (selectedIndex === null) return;
    try {
      await window.api.adminSession<'hideIndex'>(tab.connectionId, {
        kind: 'hideIndex',
        database: tab.database,
        collection: tab.collection,
        name: selectedIndex.name,
        hidden: selectedIndex.hidden !== true
      });
      await refresh();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  function openAdd() {
    setEditor({ mode: 'add', text: ADD_INITIAL });
  }

  function openEdit() {
    if (selectedIndex === null) return;
    setEditor({
      mode: 'edit',
      text: draftToJson({ key: selectedIndex.key, options: optionsOf(selectedIndex) })
    });
  }

  function openRowMenu(event: ReactMouseEvent, index: CollectionIndexInfo) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedName(index.name);
    setMenu({ x: event.clientX, y: event.clientY, index });
  }

  function openBackgroundMenu(event: ReactMouseEvent) {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, index: null });
  }

  function handleMenuItem(action: () => void) {
    return () => {
      action();
      setMenu(null);
    };
  }

  function copyIndexName(name: string) {
    navigator.clipboard.writeText(name).catch((err: unknown) => setError(messageOf(err)));
  }

  function optionsOf(index: CollectionIndexInfo): Record<string, unknown> {
    const options: Record<string, unknown> = {};
    if (index.unique === true) options.unique = true;
    if (index.sparse === true) options.sparse = true;
    if (index.hidden === true) options.hidden = true;
    if (index.expireAfterSeconds !== undefined) {
      options.expireAfterSeconds = index.expireAfterSeconds;
    }
    if (index.partialFilterExpression !== undefined) {
      options.partialFilterExpression = index.partialFilterExpression;
    }
    return options;
  }

  const menuIndex = menu !== null ? menu.index : null;

  return (
    <div className={active ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
      <div className="flex shrink-0 flex-col gap-2 p-3 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-ui font-medium text-label">
            Indexes — {tab.database}.{tab.collection}
          </span>
          <span className="flex-1" />
          <Button
            variant="quiet"
            size="sm"
            aria-label="Refresh indexes"
            title="Refresh indexes"
            disabled={loading}
            onClick={() => void refresh()}
            className="w-8 px-0"
          >
            <RefreshCcwIcon />
          </Button>
          <Button variant="accentOutline" size="sm" onClick={openAdd}>
            Add Index
          </Button>
          <Button variant="quiet" size="sm" disabled={selectedIndex === null} onClick={openEdit}>
            Edit Index
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={selectedIndex === null || isDefaultIndex}
            onClick={() => setPendingDrop(true)}
          >
            Drop Index
          </Button>
          <Button
            variant="quiet"
            size="sm"
            disabled={selectedIndex === null}
            onClick={() => setDetailsFor(selectedIndex)}
          >
            View details
          </Button>
          <Button
            variant="quiet"
            size="sm"
            disabled={selectedIndex === null || isDefaultIndex}
            onClick={() => void toggleHidden()}
          >
            {selectedIndex?.hidden === true ? 'Unhide Index' : 'Hide Index'}
          </Button>
        </div>
        {error !== null ? (
          <Banner onDismiss={() => setError(null)} className="border-b border-border">
            {error}
          </Banner>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3 pt-0">
        <div
          className="flex min-h-0 flex-1 flex-col overflow-auto rounded-field border border-border"
          onContextMenu={openBackgroundMenu}
        >
          {indexes.length === 0 && !loading ? (
            <p className="px-3 py-6 text-center text-[13px] text-label-tertiary">
              {loading ? 'Loading…' : 'No indexes found.'}
            </p>
          ) : (
            <table className="w-full text-[length:var(--dt-font-size,12px)] [font-family:var(--font-code,ui-monospace)]">
              <thead className="sticky top-0 z-10 bg-chrome">
                <tr className="text-left">
                  <th className="border-b border-border px-3 py-1.5 text-caption font-semibold text-label-secondary">
                    Name
                  </th>
                  <th className="border-b border-border px-3 py-1.5 text-caption font-semibold text-label-secondary">
                    Type
                  </th>
                  <th className="border-b border-border px-3 py-1.5 text-caption font-semibold text-label-secondary">
                    Properties
                  </th>
                  <th className="border-b border-border px-3 py-1.5 text-caption font-semibold text-label-secondary">
                    Size
                  </th>
                  <th className="border-b border-border px-3 py-1.5 text-caption font-semibold text-label-secondary">
                    Usage
                  </th>
                </tr>
              </thead>
              <tbody>
                {indexes.map((index) => {
                  const selected = index.name === selectedName;
                  return (
                    <tr
                      key={index.name}
                      onClick={() => setSelectedName(index.name)}
                      onDoubleClick={() => setDetailsFor(index)}
                      onContextMenu={(event) => openRowMenu(event, index)}
                      className={
                        selected
                          ? 'cursor-default bg-accent text-white'
                          : 'cursor-default text-label hover:bg-well'
                      }
                    >
                      <td className="max-w-64 truncate border-b border-border px-3 py-1.5">
                        {index.name}
                      </td>
                      <td className="border-b border-border px-3 py-1.5">
                        {indexTypeLabel(index.key)}
                      </td>
                      <td className="border-b border-border px-3 py-1.5">
                        {indexProperties(index)}
                      </td>
                      <td className="border-b border-border px-3 py-1.5">
                        {formatIndexSize(index.sizeBytes)}
                      </td>
                      <td className="border-b border-border px-3 py-1.5">
                        {indexUsageLabel(index.usageCount, index.usageSince)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {loading && indexes.length > 0 ? (
            <p className="px-3 py-1.5 text-xs text-label-tertiary">Refreshing…</p>
          ) : null}
        </div>
      </div>
      {editor !== null ? (
        <DocumentModal
          title={
            editor.mode === 'add'
              ? `Add index to ${tab.collection}`
              : `Edit index ${selectedIndex?.name ?? ''} in ${tab.collection}`
          }
          initialText={editor.text}
          onSave={(text) => void (editor.mode === 'add' ? addIndex(text) : editIndex(text))}
          onClose={() => setEditor(null)}
        />
      ) : null}
      {detailsFor !== null ? (
        <DocumentModal
          title={`Index ${detailsFor.name} in ${tab.collection}`}
          initialText={toShellJson({
            name: detailsFor.name,
            key: detailsFor.key,
            unique: detailsFor.unique,
            sparse: detailsFor.sparse,
            hidden: detailsFor.hidden,
            expireAfterSeconds: detailsFor.expireAfterSeconds,
            partialFilterExpression: detailsFor.partialFilterExpression,
            sizeBytes: detailsFor.sizeBytes,
            usageCount: detailsFor.usageCount
          })}
          onSave={() => {}}
          onClose={() => setDetailsFor(null)}
          viewOnly
        />
      ) : null}
      <ConfirmDialog
        open={pendingDrop}
        title="Drop index"
        message={`Drop index "${selectedName ?? ''}" from ${tab.collection}? Queries may slow down without it.`}
        confirmLabel="Drop"
        danger
        onConfirm={() => {
          void dropSelected();
        }}
        onClose={() => setPendingDrop(false)}
      />
      {menu !== null && menuIndex !== null ? (
        <Menu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <MenuItem onClick={handleMenuItem(() => setDetailsFor(menuIndex))}>View details</MenuItem>
          <MenuItem onClick={handleMenuItem(openEdit)}>Edit index</MenuItem>
          <MenuItem
            disabled={menuIndex.name === '_id_'}
            onClick={handleMenuItem(() => void toggleHidden())}
          >
            {menuIndex.hidden === true ? 'Unhide index' : 'Hide index'}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            danger
            disabled={menuIndex.name === '_id_'}
            onClick={handleMenuItem(() => setPendingDrop(true))}
          >
            Drop index
          </MenuItem>
          <MenuItem onClick={handleMenuItem(() => copyIndexName(menuIndex.name))}>
            Copy index name
          </MenuItem>
        </Menu>
      ) : null}
      {menu !== null && menu.index === null ? (
        <Menu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <MenuItem disabled={loading} onClick={handleMenuItem(() => void refresh())}>
            Refresh
          </MenuItem>
          <MenuItem onClick={handleMenuItem(openAdd)}>Add index…</MenuItem>
        </Menu>
      ) : null}
    </div>
  );
}
