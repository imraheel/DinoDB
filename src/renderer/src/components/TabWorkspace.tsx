import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppState';
import type { ResultCard as ResultCardData, TabMeta } from '../context/reducer';
import { messageOf } from '../lib/errors';
import { setCompletionFields, setMonacoTheme } from '../lib/monaco';
import { resolveTheme } from '../lib/theme';
import { parseShellQuery, splitQueries, type ParsedQuery } from '../lib/shell-query';
import { parseShellJson, toShellJson } from '../lib/shell-json';
import { lastPageSkip } from '../lib/pagination';
import type { WriteResult } from '../../../shared/ipc';
import DataTable from './DataTable';
import Banner from './ui/Banner';
import ConfirmDialog from './ConfirmDialog';
import DocumentModal from './DocumentModal';
import QueryBar from './QueryBar';
import ResultCard from './ResultCard';

interface TabWorkspaceProps {
  tab: TabMeta;
  active: boolean;
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

export default function TabWorkspace({ tab, active }: TabWorkspaceProps) {
  const { state, dispatch } = useApp();
  const data = state.tabData[tab.id];
  const [insertText, setInsertText] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ text: string; target: unknown } | null>(null);
  const [viewText, setViewText] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ target: unknown } | null>(null);
  const ranRef = useRef<string | null>(null);

  async function runParsed(
    parsed: ParsedQuery,
    sourceText: string,
    skipOverride?: number
  ): Promise<boolean> {
    if (!data) return false;
    const collection = parsed.collection ?? tab.collection;
    dispatch({ type: 'tab/errorCleared', tabId: tab.id });
    dispatch({ type: 'tab/loading', tabId: tab.id, loading: true });
    try {
      switch (parsed.op) {
        case 'find': {
          const skip = Math.max(0, skipOverride ?? parsed.skip ?? (Number(data.query.skip) || 0));
          const limit = Math.min(
            1000,
            Math.max(1, parsed.limit ?? (Number(data.query.limit) || 50))
          );
          const result = await window.api.executeTab<'find'>(tab.id, {
            kind: 'find',
            database: tab.database,
            collection,
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
            collection,
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
            collection,
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
            collection,
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
            collection,
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
            collection,
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
            collection,
            target: parsed.filter
          });
          dispatch({ type: 'tab/card', tabId: tab.id, card: writeCard('deleteOne', result, 0) });
          break;
        }
        case 'deleteMany': {
          const result = await window.api.executeTab<'deleteMany'>(tab.id, {
            kind: 'deleteMany',
            database: tab.database,
            collection,
            filter: parsed.filter
          });
          dispatch({ type: 'tab/card', tabId: tab.id, card: writeCard('deleteMany', result, 0) });
          break;
        }
        case 'insertOne': {
          const result = await window.api.executeTab<'insertOne'>(tab.id, {
            kind: 'insertOne',
            database: tab.database,
            collection,
            document: parsed.document
          });
          dispatch({ type: 'tab/card', tabId: tab.id, card: writeCard('insertOne', result, 1) });
          break;
        }
        case 'insertMany': {
          const result = await window.api.executeTab<'insertMany'>(tab.id, {
            kind: 'insertMany',
            database: tab.database,
            collection,
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
      return true;
    } catch (err) {
      dispatch({ type: 'tab/errored', tabId: tab.id, error: messageOf(err) });
      return false;
    } finally {
      dispatch({ type: 'tab/loading', tabId: tab.id, loading: false });
    }
  }

  async function runQuery(text: string, skipOverride?: number): Promise<boolean> {
    if (!data) return false;
    const parsed = parseShellQuery(text);
    if (!parsed.ok) {
      dispatch({
        type: 'tab/errored',
        tabId: tab.id,
        error: `Query failed to parse: ${parsed.message}`
      });
      return false;
    }
    return runParsed(parsed.value, text, skipOverride);
  }

  async function runEntireScript(text: string): Promise<void> {
    const segments = splitQueries(text);
    if (segments.length <= 1) {
      await runQuery(text);
      return;
    }
    dispatch({ type: 'tab/errorCleared', tabId: tab.id });
    let sawRead = false;
    for (const segment of segments) {
      const parsed = parseShellQuery(segment.text);
      if (!parsed.ok) {
        dispatch({
          type: 'tab/errored',
          tabId: tab.id,
          error: `Query failed to parse: ${parsed.message}`
        });
        return;
      }
      if (isReadOp(parsed.value.op)) sawRead = true;
      const ok = await runParsed(parsed.value, segment.text);
      if (!ok) return;
    }
    if (sawRead) dispatch({ type: 'tab/read', tabId: tab.id, text });
  }

  async function goToLastPage(text: string) {
    if (!data) return;
    const parsed = parseShellQuery(text);
    if (!parsed.ok || parsed.value.op !== 'find') return;
    const pageSize = Math.min(1000, Math.max(1, Number(data.query.limit) || 50));
    dispatch({ type: 'tab/errorCleared', tabId: tab.id });
    dispatch({ type: 'tab/loading', tabId: tab.id, loading: true });
    let lastSkip: number;
    try {
      const countResult = await window.api.executeTab<'countDocuments'>(tab.id, {
        kind: 'countDocuments',
        database: tab.database,
        collection: parsed.value.collection ?? tab.collection,
        filter: parsed.value.filter
      });
      lastSkip = lastPageSkip(countResult.count, pageSize);
      dispatch({ type: 'tab/query', tabId: tab.id, patch: { skip: String(lastSkip) } });
    } catch (err) {
      dispatch({ type: 'tab/errored', tabId: tab.id, error: messageOf(err) });
      dispatch({ type: 'tab/loading', tabId: tab.id, loading: false });
      return;
    }
    await runParsed(parsed.value, text, lastSkip);
  }

  function refresh() {
    if (!data) return;
    if (data.lastRead !== undefined) {
      if (splitQueries(data.lastRead).length > 1) {
        void runEntireScript(data.lastRead);
        return;
      }
      const parsed = parseShellQuery(data.lastRead);
      if (parsed.ok && isReadOp(parsed.value.op)) {
        void runQuery(data.lastRead);
        return;
      }
    }
    const parsed = parseShellQuery(data.query.text);
    if (parsed.ok && !isReadOp(parsed.value.op)) return;
    void runQuery(data.query.text);
  }

  function resultsCollection(): string {
    if (data !== undefined && data.lastRead !== undefined) {
      const parsed = parseShellQuery(data.lastRead);
      if (parsed.ok && parsed.value.collection !== undefined) return parsed.value.collection;
    }
    return tab.collection;
  }

  async function insertDocument(text: string) {
    try {
      const parsed: unknown = parseShellJson(text);
      await window.api.executeTab<'insertOne'>(tab.id, {
        kind: 'insertOne',
        database: tab.database,
        collection: resultsCollection(),
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
      const parsed: unknown = parseShellJson(text);
      await window.api.executeTab<'replaceOne'>(tab.id, {
        kind: 'replaceOne',
        database: tab.database,
        collection: resultsCollection(),
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
    try {
      await window.api.executeTab<'deleteOne'>(tab.id, {
        kind: 'deleteOne',
        database: tab.database,
        collection: resultsCollection(),
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
    if (!active || !data) return;
    setCompletionFields(data.fields.map((f) => f.path));
  }, [active, data?.fields]);

  useEffect(() => {
    setMonacoTheme(resolveTheme(state.settings.theme) === 'dark');
  }, [state.settings.theme]);

  if (!data) return null;

  const banner =
    data.error !== undefined ? (
      <Banner
        onDismiss={() => dispatch({ type: 'tab/errorCleared', tabId: tab.id })}
        className="border-b border-border"
      >
        {data.error}
      </Banner>
    ) : null;

  return (
    <div className={active ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
      <QueryBar
        tab={tab}
        query={data.query}
        loading={data.loading}
        active={active}
        hasMore={data.findResults?.truncated ?? false}
        onRun={(text, skipOverride) => void runQuery(text, skipOverride)}
        onRunAll={(text) => void runEntireScript(text)}
        onLastPage={(text) => void goToLastPage(text)}
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
            active={active}
            onInsert={() => setInsertText('{}')}
            onView={(document) => setViewText(toShellJson(document))}
            onEdit={(document) =>
              setEdit({ text: toShellJson(document), target: idTarget(document) })
            }
            onDelete={(document) => setPendingDelete({ target: idTarget(document) })}
            onRefresh={refresh}
          />
        )}
      </div>

      {insertText !== null ? (
        <DocumentModal
          title={`Insert into ${resultsCollection()}`}
          initialText={insertText}
          onSave={(text) => void insertDocument(text)}
          onClose={() => setInsertText(null)}
        />
      ) : null}
      {edit !== null ? (
        <DocumentModal
          title={`Edit document in ${resultsCollection()}`}
          initialText={edit.text}
          onSave={(text) => void replaceDocument(edit.target, text)}
          onClose={() => setEdit(null)}
        />
      ) : null}
      {viewText !== null ? (
        <DocumentModal
          title={`Document in ${resultsCollection()}`}
          initialText={viewText}
          onSave={() => {}}
          onClose={() => setViewText(null)}
          viewOnly
        />
      ) : null}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete document"
        message={`Delete this document from ${resultsCollection()}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (pendingDelete === null) return;
          void deleteDocument(pendingDelete.target);
        }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
