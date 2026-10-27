import { useEffect, useRef, useState } from 'react';
import type { TabMeta } from '../context/reducer';
import { useApp } from '../context/AppState';
import type {
  DatabaseTransferProgress,
  DatabaseTransferOptions,
  DatabaseRestoreMode
} from '../../../shared/database-transfer';
import { databaseTransferActive } from '../../../shared/database-transfer';
import type { DatabaseToolStatus } from '../../../shared/database-tools';
import { messageOf } from '../lib/errors';
import { BASE_INPUT_CLASS, TextInput } from './ui/Input';
import Button from './ui/Button';
import Banner from './ui/Banner';

export default function TabDatabaseTransfer({ tab, active }: { tab: TabMeta; active: boolean }) {
  const { dispatch } = useApp();
  const restore = tab.kind === 'database-restore';
  const [progress, setProgress] = useState<DatabaseTransferProgress>({
    tabId: tab.id,
    state: 'configuring',
    phase: 'Choose a backup location',
    elapsedMs: 0,
    activeCollections: [],
    completedCollections: 0,
    logTail: [],
    mayHavePartialChanges: false
  });
  const [inputKind, setInputKind] = useState<'archive' | 'directory'>('archive');
  const [gzip, setGzip] = useState(true);
  const [sourceDatabase, setSourceDatabase] = useState(tab.database);
  const [targetDatabase, setTargetDatabase] = useState(`${tab.database}_restored`);
  const [mode, setMode] = useState<DatabaseRestoreMode>('new-database');
  const [selection, setSelection] = useState('');
  const [tool, setTool] = useState<DatabaseToolStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetRef = useRef(targetDatabase);
  const lastState = useRef(progress.state);
  targetRef.current = targetDatabase;
  const running = databaseTransferActive(progress.state);
  const signature = `${inputKind}:${gzip}`;
  async function checkTool() {
    try {
      const result = await window.api.detectDatabaseTools();
      setTool(restore ? result.mongorestore : result.mongodump);
    } catch (err) {
      setError(messageOf(err));
    }
  }
  useEffect(() => {
    let alive = true;
    let received = false;
    const unsubscribe = window.api.onDatabaseTransferProgress((next) => {
      if (next.tabId !== tab.id || !alive) return;
      received = true;
      setProgress(next);
      const firstCompletion = next.state === 'completed' && lastState.current !== 'completed';
      lastState.current = next.state;
      if (firstCompletion && restore) {
        void (async () => {
          try {
            const { databases } = await window.api.connectSession(tab.connectionId);
            dispatch({ type: 'session/connected', connectionId: tab.connectionId, databases });
            const { collections } = await window.api.listCollections(
              tab.connectionId,
              targetRef.current
            );
            dispatch({
              type: 'session/collections',
              connectionId: tab.connectionId,
              database: targetRef.current,
              collections
            });
          } catch {
            /* Restore result stays available even if the session has disconnected. */
          }
        })();
      }
    });
    void (async () => {
      try {
        const [snapshot, tools] = await Promise.all([
          window.api.databaseTransferSnapshot(tab.id),
          window.api.detectDatabaseTools()
        ]);
        if (alive) {
          if (!received) setProgress(snapshot);
          setTool(restore ? tools.mongorestore : tools.mongodump);
        }
      } catch (err) {
        if (alive) setError(messageOf(err));
      }
    })();
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [tab.id, tab.connectionId, restore, dispatch]);
  async function choose() {
    setPending(true);
    setError(null);
    try {
      const filePath = await window.api.chooseDatabaseTransferPath(tab.id, inputKind, gzip);
      if (filePath) {
        setSelection(signature);
        setProgress((old) => ({
          ...old,
          filePath,
          state: 'configuring',
          phase: 'Ready',
          error: undefined
        }));
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(false);
    }
  }
  async function start() {
    setPending(true);
    setError(null);
    const options: DatabaseTransferOptions = restore
      ? { kind: 'database-restore', inputKind, gzip, sourceDatabase, targetDatabase, mode }
      : { kind: 'database-backup', gzip };
    try {
      await window.api.startDatabaseTransfer(tab.id, options);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(false);
    }
  }
  async function cancel() {
    try {
      await window.api.cancelDatabaseTransfer(tab.id);
    } catch (err) {
      setError(messageOf(err));
    }
  }
  return (
    <div className={active ? 'flex min-h-0 flex-1 flex-col overflow-auto p-5' : 'hidden'}>
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div>
          <h2 className="text-base font-semibold text-label">
            {restore ? 'Restore database' : 'Back up database'}
          </h2>
          <p className="mt-1 text-ui text-label-secondary">
            {tab.connectionName} / {tab.database}
          </p>
        </div>
        <div className="space-y-3 rounded-field border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="flex-1 break-all text-label-secondary">
              {tool?.available
                ? `${tool.name} ${tool.version} · ${tool.source}\n${tool.path}`
                : (tool?.error ?? 'Checking tools…')}
            </span>
            <Button disabled={running} onClick={() => void checkTool()}>
              Recheck
            </Button>
            <Button onClick={() => window.dispatchEvent(new Event('open-database-tools'))}>
              Tool settings
            </Button>
          </div>
          {restore ? (
            <>
              <label className="flex items-center justify-between text-xs text-label-secondary">
                Backup input
                <select
                  className={BASE_INPUT_CLASS}
                  value={inputKind}
                  disabled={running || pending}
                  onChange={(event) => setInputKind(event.target.value as 'archive' | 'directory')}
                >
                  <option value="archive">Archive file</option>
                  <option value="directory">Dump directory</option>
                </select>
              </label>
              <label className="block text-xs text-label-secondary">
                Source database in backup
                <TextInput
                  className="mt-1 w-full"
                  value={sourceDatabase}
                  disabled={running || pending}
                  onChange={(event) => setSourceDatabase(event.target.value)}
                />
              </label>
              <label className="block text-xs text-label-secondary">
                Destination database
                <TextInput
                  className="mt-1 w-full"
                  value={targetDatabase}
                  disabled={running || pending}
                  onChange={(event) => setTargetDatabase(event.target.value)}
                />
              </label>
              <label className="flex items-center justify-between text-xs text-label-secondary">
                Restore mode
                <select
                  className={BASE_INPUT_CLASS}
                  value={mode}
                  disabled={running || pending}
                  onChange={(event) => setMode(event.target.value as DatabaseRestoreMode)}
                >
                  <option value="new-database">Create new database</option>
                  <option value="insert">Insert into existing collections</option>
                  <option value="replace-collections">Replace backed-up collections</option>
                </select>
              </label>
              <p className="text-xs text-label-tertiary">
                Select the dump root or its database directory. Enter the original database name
                even when restoring under another name. Completed writes remain after cancellation
                or failure.
              </p>
            </>
          ) : (
            <p className="text-xs text-label-tertiary">
              Includes collection data, indexes and options. A database-only dump is not a single
              point-in-time snapshot while other applications are writing.
            </p>
          )}
          <label className="flex items-center gap-2 text-xs text-label-secondary">
            <input
              type="checkbox"
              checked={gzip}
              disabled={running || pending}
              onChange={(event) => setGzip(event.target.checked)}
            />
            {restore ? 'Input was compressed with gzip' : 'Compress archive with gzip'}
          </label>
          <div className="flex items-center gap-3">
            <p className="flex-1 break-all text-xs text-label-secondary">
              {progress.filePath ?? 'No location selected'}
            </p>
            <Button disabled={running || pending} onClick={() => void choose()}>
              {restore ? 'Choose backup…' : 'Save as…'}
            </Button>
          </div>
          {selection && selection !== signature ? (
            <p className="text-xs text-label-secondary">
              Choose the backup location again for these input/compression options.
            </p>
          ) : null}
          <div className="flex justify-end">
            {running ? (
              <Button disabled={progress.state === 'cancelling'} onClick={() => void cancel()}>
                Cancel
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={
                  pending || !tool?.available || !progress.filePath || selection !== signature
                }
                onClick={() => void start()}
              >
                {restore ? 'Start restore' : 'Start backup'}
              </Button>
            )}
          </div>
        </div>
        {error ? <Banner onDismiss={() => setError(null)}>{error}</Banner> : null}
        <div className="space-y-3 rounded-field border border-border p-4">
          <div aria-live="polite" className="text-ui text-label">
            {progress.phase}
          </div>
          <progress
            aria-label="Database operation progress"
            className="h-2 w-full accent-accent"
            max={100}
            {...(progress.state === 'completed' ? { value: 100 } : running ? {} : { value: 0 })}
          />
          <p className="text-xs text-label-secondary">
            {progress.completedCollections} collections completed ·{' '}
            {(progress.elapsedMs / 1000).toFixed(1)} seconds
            {progress.documents !== undefined ? ` · ${progress.documents} documents reported` : ''}
          </p>
          {progress.activeCollections.length ? (
            <p className="text-xs text-label-secondary">
              Active: {progress.activeCollections.join(', ')}
            </p>
          ) : null}
          {progress.error ? (
            <p className="break-words text-xs text-danger">{progress.error}</p>
          ) : null}
          {progress.mayHavePartialChanges && progress.state !== 'completed' ? (
            <p className="text-xs text-label-secondary">
              The destination may contain partial changes. Review it before retrying; changes are
              not rolled back.
            </p>
          ) : null}
          <pre
            aria-label="MongoDB tool log"
            className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-field bg-well p-3 text-xs text-label-secondary"
          >
            {progress.logTail.join('\n') || 'Tool output will appear here.'}
          </pre>
        </div>
      </div>
    </div>
  );
}
