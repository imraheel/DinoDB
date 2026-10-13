import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppState';
import type { ResultCard as ResultCardData, TabMeta } from '../context/reducer';
import { messageOf } from '../lib/errors';
import { setCompletionFields, setMonacoTheme } from '../lib/monaco';
import { resolveTheme } from '../lib/theme';
import { parseShellQuery, type ParsedQuery } from '../lib/shell-query';
import type { WriteResult } from '../../../shared/ipc';
import DataTable from './DataTable';
import DocumentModal from './DocumentModal';
import QueryBar from './QueryBar';
import ResultCard from './ResultCard';

interface TabWorkspaceProps {
  tab: TabMeta;
}

function idTarget(document: unknown): unknown {
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    return document;
  }
  return { _id: (document as Record<string, unknown>)._id };
}

function isReadOp(op: ParsedQuery['op']): boolean {
  return op === 'find' || op === 'findOne' || op === 'countDocuments' || op === 'aggregate';
}

function hasOutputStage(pipeline: unknown[]): boolean {
  return pipeline.some(
    (stage) =>
      stage !== null &&
      typeof stage === 'object' &&
      !Array.isArray(stage) &&
      ('$out' in stage || '$merge' in stage)
  );
}

function writeCard(op: string, result: WriteResult, inserted: number): ResultCardData {
  return {
    kind: 'write',
    op,
    matched: result.matched,
    modified: result.modified,
    deleted: result.deleted,
    inserted,
    insertedId: result.insertedId
  };
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

  async function runParsed(parsed: ParsedQuery, sourceText: string) {
    if (!data) return;
    dispatch({ type: 'tab/errorCleared', tabId: tab.id });
    dispatch({ type: 'tab/loading', tabId: tab.id, loading: true });
    try {
      switch (parsed.op) {
        case 'find': {
          const skip = Math.max(0, parsed.skip ?? (Number(data.query.skip) || 0));
          const limit = Math.min(
            1000,
            Math.max(1, parsed.limit ?? (Number(data.query.limit) || 50))
          );
          const result = await window.api.executeTab<'find'>(tab.id, {
            kind: 'find',
            database: tab.database,
            collection: tab.collection,
            filter: parsed.filter,
            projection: parsed.projection,
            sort: parsed.sort,
            skip,
            limit
          });
          dispatch({ type: 'tab/results', tabId: tab.id, results: result });
          break;
        }
        case 'findOne': {
          const result = await window.api.executeTab<'find'>(tab.id, {
            kind: 'find',
            database: tab.database,
            collection: tab.collection,
            filter: parsed.filter,
            projection: parsed.projection,
            sort: parsed.sort,
            skip: 0,
            limit: 1
          });
          dispatch({ type: 'tab/results', tabId: tab.id, results: result });
          break;
        }
        case 'countDocuments': {
          const result = await window.api.executeTab<'countDocuments'>(tab.id, {
            kind: 'countDocuments',
            database: tab.database,
            collection: tab.collection,
            filter: parsed.filter
          });
          dispatch({
            type: 'tab/card',
            tabId: tab.id,
            card: { kind: 'count', count: result.count }
          });
          break;
        }
        case 'aggregate': {
          const limit = Math.min(1000, Math.max(1, Number(data.query.limit) || 50));
          const result = await window.api.executeTab<'aggregate'>(tab.id, {
            kind: 'aggregate',
            database: tab.database,
            collection: tab.collection,
            pipeline: parsed.pipeline,
            limit
          });
          if (hasOutputStage(parsed.pipeline)) {
            dispatch({
              type: 'tab/card',
              tabId: tab.id,
              card: {
                kind: 'write',
                op: 'aggregate',
                matched: 0,
                modified: 0,
                deleted: 0,
                inserted: 0,
                insertedId: null,
                message:
                  'Pipeline wrote its output ($out/$merge) — run a find on the target collection to view it.'
              }
            });
          } else {
            dispatch({ type: 'tab/results', tabId: tab.id, results: result });
          }
          break;
        }
        case 'updateOne':
        case 'updateMany': {
          const result = await window.api.executeTab<'updateOne' | 'updateMany'>(tab.id, {
            kind: parsed.op,
            database: tab.database,
            collection: tab.collection,
            filter: parsed.filter,
            update: parsed.update,
            upsert: parsed.upsert
          });
          dispatch({
            type: 'tab/card',
            tabId: tab.id,
            card: writeCard(parsed.op, result, result.insertedId != null ? 1 : 0)
          });
          break;
        }
        case 'replaceOne': {
          const result = await window.api.executeTab<'replaceOne'>(tab.id, {
            kind: 'replaceOne',
            database: tab.database,
            collection: tab.collection,
            target: parsed.filter,
            document: parsed.replacement,
            upsert: parsed.upsert
          });
          dispatch({
            type: 'tab/card',
            tabId: tab.id,
            card: writeCard('replaceOne', result, result.insertedId != null ? 1 : 0)
          });
          break;
        }
        case 'deleteOne': {
          const result = await window.api.executeTab<'deleteOne'>(tab.id, {
            kind: 'deleteOne',
            database: tab.database,
            collection: tab.collection,
            target: parsed.filter
          });
          dispatch({ type: 'tab/card', tabId: tab.id, card: writeCard('deleteOne', result, 0) });
          break;
        }
        case 'deleteMany': {
          const result = await window.api.executeTab<'deleteMany'>(tab.id, {
            kind: 'deleteMany',
            database: tab.database,
            collection: tab.collection,
            filter: parsed.filter
          });
          dispatch({ type: 'tab/card', tabId: tab.id, card: writeCard('deleteMany', result, 0) });
          break;
        }
        case 'insertOne': {
          const result = await window.api.executeTab<'insertOne'>(tab.id, {
            kind: 'insertOne',
            database: tab.database,
            collection: tab.collection,
            document: parsed.document
          });
          dispatch({ type: 'tab/card', tabId: tab.id, card: writeCard('insertOne', result, 1) });
          break;
        }
        case 'insertMany': {
          const result = await window.api.executeTab<'insertMany'>(tab.id, {
            kind: 'insertMany',
            database: tab.database,
            collection: tab.collection,
            documents: parsed.documents
          });
          dispatch({
            type: 'tab/card',
            tabId: tab.id,
            card: writeCard('insertMany', result, parsed.documents.length)
          });
          break;
        }
      }
      const recordsRead =
        isReadOp(parsed.op) && !(parsed.op === 'aggregate' && hasOutputStage(parsed.pipeline));
      if (recordsRead) dispatch({ type: 'tab/read', tabId: tab.id, text: sourceText });
    } catch (err) {
      dispatch({ type: 'tab/errored', tabId: tab.id, error: messageOf(err) });
    } finally {
      dispatch({ type: 'tab/loading', tabId: tab.id, loading: false });
    }
  }

  async function runQuery() {
    if (!data) return;
    const parsed = parseShellQuery(data.query.text);
    if (!parsed.ok) {
      dispatch({
        type: 'tab/errored',
        tabId: tab.id,
        error: `Query failed to parse: ${parsed.message}`
      });
      return;
    }
    await runParsed(parsed.value, data.query.text);
  }

  function refresh() {
    if (!data) return;
    if (data.lastRead !== undefined) {
      const parsed = parseShellQuery(data.lastRead);
      if (parsed.ok && isReadOp(parsed.value.op)) {
        void runParsed(parsed.value, data.lastRead);
        return;
      }
    }
    const parsed = parseShellQuery(data.query.text);
    if (parsed.ok && !isReadOp(parsed.value.op)) return;
    void runQuery();
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
      refresh();
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
      refresh();
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
      refresh();
    } catch (err) {
      dispatch({ type: 'tab/errored', tabId: tab.id, error: messageOf(err) });
    }
  }

  useEffect(() => {
    if (ranRef.current === tab.id) return;
    ranRef.current = tab.id;
    refresh();
  }, [tab.id]);

  useEffect(() => {
    if (!data) return;
    setCompletionFields(data.fields.map((f) => f.path));
  }, [data?.fields]);

  useEffect(() => {
    setMonacoTheme(resolveTheme(state.settings.theme) === 'dark');
  }, [state.settings.theme]);

  if (!data) return null;

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
        onRun={() => void runQuery()}
      />
      {banner}
      <div className="flex min-h-0 flex-1 flex-col p-3">
        {data.card !== undefined ? (
          <ResultCard
            card={data.card}
            onShowResults={data.lastRead !== undefined ? refresh : null}
          />
        ) : (
          <DataTable
            fields={data.fields}
            documents={data.findResults?.documents ?? []}
            truncated={data.findResults?.truncated ?? false}
            loading={data.loading}
            readOnly={false}
            onInsert={() => setInsertText('{}')}
            onEdit={(document) =>
              setEdit({ text: JSON.stringify(document, null, 2), target: idTarget(document) })
            }
            onDelete={(document) => void deleteDocument(idTarget(document))}
          />
        )}
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
