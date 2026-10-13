import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppState';
import type { TabMeta } from '../context/reducer';
import { messageOf } from '../lib/errors';
import { setCompletionFields, setMonacoTheme } from '../lib/monaco';
import { resolveTheme } from '../lib/theme';
import { parseShellFindQuery } from '../lib/shell-query';
import DataTable from './DataTable';
import DocumentModal from './DocumentModal';
import QueryBar from './QueryBar';

interface TabWorkspaceProps {
  tab: TabMeta;
}

function idTarget(document: unknown): unknown {
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    return document;
  }
  return { _id: (document as Record<string, unknown>)._id };
}

function ErrorBanner({ error, onDismiss }: { error: string; onDismiss(): void }) {
  return (
    <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
      <span className="min-w-0 flex-1 break-words">{error}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="shrink-0 font-bold hover:text-red-800 dark:hover:text-red-300"
      >
        ✕
      </button>
    </div>
  );
}

export default function TabWorkspace({ tab }: TabWorkspaceProps) {
  const { state, dispatch } = useApp();
  const data = state.tabData[tab.id];
  const [insertText, setInsertText] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ text: string; target: unknown } | null>(null);
  const ranRef = useRef<string | null>(null);

  async function runFind() {
    const query = data?.query;
    if (!query) return;
    const parsed = parseShellFindQuery(query.text);
    if (!parsed.ok) {
      dispatch({
        type: 'tab/errored',
        tabId: tab.id,
        error: `Query failed to parse: ${parsed.message}`
      });
      return;
    }
    const skip = Math.max(0, parsed.value.skip ?? (Number(query.skip) || 0));
    const limit = Math.min(1000, Math.max(1, parsed.value.limit ?? (Number(query.limit) || 50)));
    dispatch({ type: 'tab/loading', tabId: tab.id, loading: true });
    try {
      const result = await window.api.executeTab<'find'>(tab.id, {
        kind: 'find',
        database: tab.database,
        collection: tab.collection,
        filter: parsed.value.filter,
        projection: parsed.value.projection,
        sort: parsed.value.sort,
        skip,
        limit
      });
      dispatch({ type: 'tab/results', tabId: tab.id, results: result });
    } catch (err) {
      dispatch({ type: 'tab/errored', tabId: tab.id, error: messageOf(err) });
    } finally {
      dispatch({ type: 'tab/loading', tabId: tab.id, loading: false });
    }
  }

  async function insertDocument(text: string) {
    try {
      const parsed: unknown = JSON.parse(text);
      await window.api.executeTab<'insertOne'>(tab.id, {
        kind: 'insertOne',
        database: tab.database,
        collection: tab.collection,
        document: parsed
      });
      setInsertText(null);
      await runFind();
    } catch (err) {
      dispatch({ type: 'tab/errored', tabId: tab.id, error: messageOf(err) });
    }
  }

  async function replaceDocument(target: unknown, text: string) {
    try {
      const parsed: unknown = JSON.parse(text);
      await window.api.executeTab<'replaceOne'>(tab.id, {
        kind: 'replaceOne',
        database: tab.database,
        collection: tab.collection,
        target,
        document: parsed
      });
      setEdit(null);
      await runFind();
    } catch (err) {
      dispatch({ type: 'tab/errored', tabId: tab.id, error: messageOf(err) });
    }
  }

  async function deleteDocument(target: unknown) {
    if (!window.confirm('Delete this document?')) return;
    try {
      await window.api.executeTab<'deleteOne'>(tab.id, {
        kind: 'deleteOne',
        database: tab.database,
        collection: tab.collection,
        target
      });
      await runFind();
    } catch (err) {
      dispatch({ type: 'tab/errored', tabId: tab.id, error: messageOf(err) });
    }
  }

  useEffect(() => {
    if (ranRef.current === tab.id) return;
    ranRef.current = tab.id;
    void runFind();
  }, [tab.id]);

  useEffect(() => {
    if (!data) return;
    setCompletionFields(data.fields.map((f) => f.path));
  }, [data?.fields]);

  useEffect(() => {
    setMonacoTheme(resolveTheme(state.settings.theme) === 'dark');
  }, [state.settings.theme]);

  if (!data) return null;

  function refresh() {
    void runFind();
  }

  const banner =
    data.error !== undefined ? (
      <ErrorBanner
        error={data.error}
        onDismiss={() => dispatch({ type: 'tab/errorCleared', tabId: tab.id })}
      />
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
            {tab.title}
          </h2>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {tab.connectionName} · {tab.database}.{tab.collection}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>
      </div>

      <QueryBar
        tabId={tab.id}
        query={data.query}
        loading={data.loading}
        onRun={() => void runFind()}
      />
      {banner}
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <DataTable
          fields={data.fields}
          documents={data.findResults?.documents ?? []}
          truncated={data.findResults?.truncated ?? false}
          loading={data.loading}
          readOnly={false}
          onInsert={() => setInsertText('{}')}
          onEdit={(document) =>
            setEdit({
              text: JSON.stringify(document, null, 2),
              target: idTarget(document)
            })
          }
          onDelete={(document) => void deleteDocument(idTarget(document))}
        />
      </div>

      {insertText !== null ? (
        <DocumentModal
          title={`Insert into ${tab.collection}`}
          initialText={insertText}
          onSave={(text) => void insertDocument(text)}
          onClose={() => setInsertText(null)}
        />
      ) : null}
      {edit !== null ? (
        <DocumentModal
          title={`Edit document in ${tab.collection}`}
          initialText={edit.text}
          onSave={(text) => void replaceDocument(edit.target, text)}
          onClose={() => setEdit(null)}
        />
      ) : null}
    </div>
  );
}
