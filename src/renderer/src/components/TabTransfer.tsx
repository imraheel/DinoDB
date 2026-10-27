import { useEffect, useState } from 'react';
import type { TabMeta } from '../context/reducer';
import type { TransferFormat, TransferProgress } from '../../../shared/transfer';
import { transferActive } from '../../../shared/transfer';
import { messageOf } from '../lib/errors';
import Banner from './ui/Banner';
import Button from './ui/Button';

function bytesText(bytes: number): string {
  if (bytes < 1024) return `${bytes.toLocaleString()} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TabTransfer({ tab, active }: { tab: TabMeta; active: boolean }) {
  const [format, setFormat] = useState<TransferFormat>('json');
  const [progress, setProgress] = useState<TransferProgress>({
    tabId: tab.id,
    status: 'configuring',
    phase: 'Choose a file to begin',
    documents: 0,
    bytes: 0,
    elapsedMs: 0
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const running = transferActive(progress.status);
  const importing = tab.kind === 'import';

  useEffect(() => {
    let alive = true;
    let received = false;
    const unsubscribe = window.api.onTransferProgress((next) => {
      if (next.tabId === tab.id) {
        received = true;
        if (alive) setProgress(next);
      }
    });
    async function load() {
      try {
        const next = await window.api.transferSnapshot(tab.id);
        if (alive && !received) setProgress(next);
      } catch (err) {
        if (alive) setError(messageOf(err));
      }
    }
    void load();
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [tab.id]);

  async function chooseFile() {
    setPending(true);
    setError(null);
    try {
      const next = await window.api.chooseTransferFile(tab.id, format);
      setProgress(next);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(false);
    }
  }
  async function start() {
    setPending(true);
    setError(null);
    try {
      await window.api.startTransfer(tab.id, format);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(false);
    }
  }
  async function cancel() {
    setError(null);
    try {
      await window.api.cancelTransfer(tab.id);
    } catch (err) {
      setError(messageOf(err));
    }
  }
  const ratio =
    progress.status === 'completed'
      ? 1
      : importing && progress.totalBytes
        ? Math.min(0.99, progress.bytes / progress.totalBytes)
        : progress.totalDocuments !== undefined &&
            progress.totalDocuments > 0 &&
            progress.phase !== 'Discovering CSV columns'
          ? Math.min(0.99, progress.documents / progress.totalDocuments)
          : undefined;
  const terminal =
    progress.status === 'completed' ||
    progress.status === 'failed' ||
    progress.status === 'cancelled';

  return (
    <div className={active ? 'flex min-h-0 flex-1 flex-col overflow-auto p-5' : 'hidden'}>
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <div>
          <h2 className="text-base font-semibold text-label">
            {importing ? 'Import data' : 'Export data'}
          </h2>
          <p className="mt-1 text-ui text-label-secondary">
            {tab.connectionName} / {tab.database}.{tab.collection}
          </p>
          <p className="mt-1 text-xs text-label-tertiary">{tab.transferScope}</p>
        </div>
        <div className="space-y-4 rounded-field border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <label htmlFor={`format-${tab.id}`} className="text-ui text-label-secondary">
              Format
            </label>
            <select
              id={`format-${tab.id}`}
              value={format}
              disabled={running || pending}
              onChange={(event) => setFormat(event.target.value as TransferFormat)}
              className="rounded-field border border-border-strong bg-surface px-3 py-1 text-ui text-label"
            >
              <option value="json">Extended JSON</option>
              <option value="simple-json">Simple JSON</option>
              <option value="csv">CSV</option>
              <option value="bson">BSON</option>
            </select>
            <span className="flex-1" />
            <Button disabled={running || pending} onClick={() => void chooseFile()}>
              {importing ? 'Choose file…' : 'Save as…'}
            </Button>
          </div>
          <p className="break-all text-xs text-label-secondary">
            {progress.filePath ?? 'No file selected'}
          </p>
          {progress.format !== undefined && progress.format !== format ? (
            <p className="text-xs text-label-secondary">
              Choose a new file for{' '}
              {format === 'simple-json' ? 'Simple JSON' : format.toUpperCase()}.
            </p>
          ) : null}
          <p className="text-xs leading-relaxed text-label-tertiary">
            {format === 'csv'
              ? 'CSV exports readable values: ObjectIds as hex, dates as ISO text, and numbers as digits. Nested values use plain JSON. Scalar cells import as strings.'
              : format === 'simple-json'
                ? 'Simple JSON converts ObjectIds and dates to strings, and keeps ordinary numbers and booleans. Long and Decimal128 values use strings to preserve their digits. Import does not infer MongoDB types from strings.'
                : format === 'bson'
                  ? 'BSON preserves MongoDB document types. Use an uncompressed collection BSON file.'
                  : 'Extended JSON preserves MongoDB types. Import accepts an object, an array of documents, or newline-delimited documents.'}
          </p>
          {importing ? (
            <p className="text-xs text-label-tertiary">
              Documents are appended. Existing IDs are preserved. Errors stop the import; documents
              already inserted remain.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            {running ? (
              <Button disabled={progress.status === 'cancelling'} onClick={() => void cancel()}>
                Cancel
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={pending || !progress.filePath || progress.format !== format}
                onClick={() => void start()}
              >
                {terminal ? 'Run again' : importing ? 'Start import' : 'Start export'}
              </Button>
            )}
          </div>
        </div>
        {error !== null ? <Banner onDismiss={() => setError(null)}>{error}</Banner> : null}
        <div className="space-y-3 rounded-field border border-border p-4" aria-live="polite">
          <div className="flex items-center justify-between text-ui">
            <span className={progress.status === 'completed' ? 'text-success' : 'text-label'}>
              {progress.phase}
            </span>
            {ratio !== undefined ? (
              <span className="text-label-secondary">{Math.floor(ratio * 100)}%</span>
            ) : null}
          </div>
          <progress
            aria-label={`${importing ? 'Import' : 'Export'} progress`}
            max={1}
            {...(ratio !== undefined ? { value: ratio } : running ? {} : { value: 0 })}
            className="h-2 w-full accent-accent"
          />
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-label-secondary">
            <span>
              {progress.documents.toLocaleString()} documents{' '}
              {importing
                ? 'imported'
                : progress.phase === 'Discovering CSV columns'
                  ? 'read'
                  : 'exported'}
            </span>
            <span>
              {bytesText(progress.bytes)}
              {progress.totalBytes !== undefined ? ` / ${bytesText(progress.totalBytes)}` : ''}
            </span>
            <span>{(progress.elapsedMs / 1000).toFixed(1)} seconds</span>
          </div>
          {running ? (
            <p className="text-xs text-label-tertiary">
              Running in a separate process. You can continue working in other tabs.
            </p>
          ) : null}
          {progress.error ? (
            <p className="break-words text-xs text-danger">{progress.error}</p>
          ) : null}
          {terminal && importing && progress.status !== 'completed' ? (
            <p className="text-xs text-label-secondary">
              {progress.documents.toLocaleString()} confirmed inserts remain in the collection.
              {progress.uncertainBatch
                ? ' The final batch outcome is uncertain; check the collection before retrying.'
                : ''}
            </p>
          ) : null}
          {progress.status === 'cancelled' && !importing ? (
            <p className="text-xs text-label-secondary">The partial export was discarded.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
