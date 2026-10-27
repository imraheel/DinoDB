import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import * as path from 'node:path';
import { dialog, utilityProcess, type WebContents } from 'electron';
import type { ConnectionConfig } from '../../shared/types';
import type {
  TransferFormat,
  TransferFromWorker,
  TransferInput,
  TransferProgress,
  TransferToWorker
} from '../../shared/transfer';
import { assertReadOnlyPipeline, transferActive, transferTempPaths } from '../../shared/transfer';

export interface TransferWorker {
  postMessage(message: TransferToWorker): void;
  on(event: 'message', listener: (message: TransferFromWorker) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
  kill(): boolean;
}
interface RecordState {
  input: TransferInput;
  owner: WebContents;
  progress: TransferProgress;
  worker?: TransferWorker;
  format?: TransferFormat;
  timer?: ReturnType<typeof setTimeout>;
}
export const TRANSFER_PROGRESS_CHANNEL = 'transfers:progress';

export class TransfersManager {
  private readonly records = new Map<string, RecordState>();
  private readonly owners = new Set<number>();
  private readonly activeImports = new Map<string, { connectionId: string; database: string }>();
  constructor(
    private readonly fork: () => TransferWorker = () =>
      utilityProcess.fork(path.join(__dirname, '..', 'utility', 'transfer.js'), [], {
        serviceName: 'nexdb-transfer'
      })
  ) {}

  create(input: TransferInput, owner: WebContents): string {
    if (
      !input.database ||
      !input.collection ||
      !input.connectionId ||
      !['import', 'export'].includes(input.direction)
    ) {
      throw new Error('Invalid transfer configuration.');
    }
    if (input.source?.kind === 'aggregate') assertReadOnlyPipeline(input.source.pipeline);
    const tabId = randomUUID();
    this.records.set(tabId, {
      input,
      owner,
      progress: {
        tabId,
        status: 'configuring',
        phase: 'Choose a file to begin',
        documents: 0,
        bytes: 0,
        elapsedMs: 0
      }
    });
    if (!this.owners.has(owner.id)) {
      this.owners.add(owner.id);
      owner.once('destroyed', () => {
        this.owners.delete(owner.id);
        for (const [id, record] of this.records) if (record.owner === owner) this.close(id);
      });
    }
    return tabId;
  }
  private record(tabId: string, owner: WebContents): RecordState {
    const record = this.records.get(tabId);
    if (!record || record.owner !== owner)
      throw new Error('Transfer tab is closed or unavailable.');
    return record;
  }
  owns(tabId: string, owner: WebContents): boolean {
    return this.records.get(tabId)?.owner === owner;
  }
  snapshot(tabId: string, owner: WebContents): TransferProgress {
    return { ...this.record(tabId, owner).progress };
  }
  connectionId(tabId: string, owner: WebContents): string {
    return this.record(tabId, owner).input.connectionId;
  }
  target(
    tabId: string,
    owner: WebContents
  ): { connectionId: string; database: string; direction: string } {
    const { connectionId, database, direction } = this.record(tabId, owner).input;
    return { connectionId, database, direction };
  }
  hasActiveImport(connectionId: string, database: string): boolean {
    return [...this.activeImports.values()].some(
      (target) => target.connectionId === connectionId && target.database === database
    );
  }
  private publish(record: RecordState) {
    if (!record.owner.isDestroyed()) record.owner.send(TRANSFER_PROGRESS_CHANNEL, record.progress);
  }
  async chooseFile(
    tabId: string,
    owner: WebContents,
    format: TransferFormat
  ): Promise<TransferProgress> {
    if (!['json', 'simple-json', 'csv', 'bson'].includes(format))
      throw new Error('Unsupported file format.');
    const record = this.record(tabId, owner);
    if (transferActive(record.progress.status)) throw new Error('Transfer is already running.');
    const extension = format === 'simple-json' ? 'json' : format;
    const filters = [
      {
        name: format === 'simple-json' ? 'Simple JSON' : format.toUpperCase(),
        extensions: [extension]
      }
    ];
    const result =
      record.input.direction === 'import'
        ? await dialog.showOpenDialog({ title: 'Import data', filters, properties: ['openFile'] })
        : await dialog.showSaveDialog({
            title: 'Export data',
            filters,
            defaultPath: `${record.input.collection.replace(/[^\w.-]/g, '_')}.${extension}`
          });
    if (result.canceled) return this.snapshot(tabId, owner);
    this.record(tabId, owner);
    if (transferActive(record.progress.status)) throw new Error('Transfer is already running.');
    const filePath = 'filePaths' in result ? result.filePaths[0] : result.filePath;
    if (filePath) {
      record.format = format;
      record.progress = {
        tabId,
        status: 'configuring',
        phase: 'Ready',
        filePath,
        format,
        documents: 0,
        bytes: 0,
        elapsedMs: 0
      };
      this.publish(record);
    }
    return { ...record.progress };
  }
  start(
    tabId: string,
    owner: WebContents,
    format: TransferFormat,
    connection: ConnectionConfig
  ): TransferProgress {
    const record = this.record(tabId, owner);
    if (transferActive(record.progress.status)) throw new Error('Transfer is already running.');
    if (!record.progress.filePath || record.format !== format)
      throw new Error('Choose a file for this format first.');
    const filePath = record.progress.filePath;
    const runId = randomUUID();
    record.progress = {
      tabId,
      filePath,
      format,
      status: 'starting',
      phase: 'Starting worker',
      documents: 0,
      bytes: 0,
      elapsedMs: 0
    };
    let worker: TransferWorker;
    try {
      worker = this.fork();
    } catch (error) {
      record.progress = {
        ...record.progress,
        status: 'failed',
        phase: 'Worker could not start',
        error: error instanceof Error ? error.message : String(error)
      };
      this.publish(record);
      throw error;
    }
    record.worker = worker;
    if (record.input.direction === 'import') this.activeImports.set(runId, record.input);
    worker.on('message', (message) => {
      if (record.worker !== worker || message.kind !== 'progress') return;
      const cancelling = record.progress.status === 'cancelling';
      record.progress = {
        ...message.progress,
        ...(cancelling && transferActive(message.progress.status)
          ? { status: 'cancelling' as const }
          : {})
      };
      this.publish(record);
      if (!transferActive(record.progress.status)) {
        if (record.timer) clearTimeout(record.timer);
        record.timer = undefined;
      }
    });
    worker.on('exit', () => {
      this.activeImports.delete(runId);
      if (record.input.direction === 'export') {
        void Promise.all(
          transferTempPaths({ tabId, filePath, runId }).map((temp) =>
            rm(temp, { force: true }).catch(() => {})
          )
        );
      }
      if (record.worker !== worker) return;
      record.worker = undefined;
      if (record.timer) clearTimeout(record.timer);
      record.timer = undefined;
      if (transferActive(record.progress.status)) {
        const cancelled = record.progress.status === 'cancelling';
        record.progress = {
          ...record.progress,
          status: cancelled ? 'cancelled' : 'failed',
          phase: cancelled ? 'Cancelled' : 'Worker stopped',
          error: cancelled
            ? 'Worker stopped before cleanup completed. Last confirmed counts are shown.'
            : 'Transfer worker exited unexpectedly. Last confirmed counts are shown.',
          uncertainBatch:
            record.input.direction === 'import' && record.progress.uncertainBatch === true
        };
        this.publish(record);
      }
    });
    this.publish(record);
    try {
      worker.postMessage({
        kind: 'start',
        job: { ...record.input, tabId, runId, format, filePath, connection }
      });
    } catch (error) {
      record.progress = {
        ...record.progress,
        status: 'failed',
        phase: 'Worker could not start',
        error: error instanceof Error ? error.message : String(error)
      };
      this.publish(record);
      worker.kill();
      throw error;
    }
    return { ...record.progress };
  }
  cancel(tabId: string, owner: WebContents): void {
    this.cancelRecord(this.record(tabId, owner));
  }
  private cancelRecord(record: RecordState) {
    if (
      !record.worker ||
      !transferActive(record.progress.status) ||
      record.progress.status === 'cancelling'
    )
      return;
    record.progress = {
      ...record.progress,
      status: 'cancelling',
      phase: 'Cancelling — waiting for the current batch'
    };
    this.publish(record);
    record.worker.postMessage({ kind: 'cancel' });
    const worker = record.worker;
    record.timer = setTimeout(() => {
      if (record.worker === worker) worker.kill();
    }, 5000);
  }
  close(tabId: string): void {
    const record = this.records.get(tabId);
    if (!record) return;
    this.cancelRecord(record);
    this.records.delete(tabId);
  }
  closeForConnection(connectionId: string): void {
    for (const [id, record] of this.records)
      if (record.input.connectionId === connectionId) this.close(id);
  }
  disposeAll(): void {
    for (const record of this.records.values()) {
      if (record.timer) clearTimeout(record.timer);
      record.worker?.kill();
    }
    this.records.clear();
  }
}
