import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { app, dialog, utilityProcess, type WebContents } from 'electron';
import type { ConnectionConfig, AppSettings } from '../../shared/types';
import type {
  DatabaseTransferInput,
  DatabaseTransferOptions,
  DatabaseTransferProgress,
  DatabaseFromWorker,
  DatabaseToWorker,
  DatabaseTransferJob
} from '../../shared/database-transfer';
import {
  databaseTransferActive,
  validateDatabase,
  validateDatabaseOptions
} from '../../shared/database-transfer';
import { terminateTool } from '../../shared/tool-process';
import { DatabaseTools } from './database-tools';

export const DATABASE_PROGRESS_CHANNEL = 'database-transfers:progress';
export interface DatabaseWorker {
  postMessage(message: DatabaseToWorker): void;
  on(event: 'message', listener: (message: DatabaseFromWorker) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
  kill(): boolean;
}
interface Operation {
  input: DatabaseTransferInput;
  owner: WebContents;
  progress: DatabaseTransferProgress;
  selection?: { inputKind: 'archive' | 'directory'; gzip: boolean };
  worker?: DatabaseWorker;
  childPid?: number;
  timer?: ReturnType<typeof setTimeout>;
  runId?: string;
  job?: DatabaseTransferJob;
  closed?: boolean;
  busy?: boolean;
  lock?: string;
  done?: Promise<void>;
  finish?: () => void;
}
export class DatabaseTransfersManager {
  private readonly records = new Map<string, Operation>();
  private readonly owners = new Set<number>();
  private readonly locks = new Set<string>();
  private shuttingDown = false;
  constructor(
    private readonly tools: DatabaseTools,
    private readonly settings: () => AppSettings,
    private readonly connection: (id: string) => ConnectionConfig | null,
    private readonly hasImport: (connectionId: string, database: string) => boolean,
    private readonly fork: () => DatabaseWorker = () =>
      utilityProcess.fork(path.join(__dirname, '..', 'utility', 'database-transfer.js'), [], {
        serviceName: 'dinodb-database-transfer'
      })
  ) {}
  create(input: DatabaseTransferInput, owner: WebContents): string {
    if (this.shuttingDown) throw new Error('Application is shutting down.');
    if (
      !input ||
      !['database-backup', 'database-restore'].includes(input.kind) ||
      typeof input.connectionId !== 'string' ||
      !this.connection(input.connectionId)
    )
      throw new Error('Invalid database operation or connection.');
    validateDatabase(input.database, input.kind === 'database-restore');
    const tabId = randomUUID();
    this.records.set(tabId, {
      input,
      owner,
      progress: {
        tabId,
        state: 'configuring',
        phase: 'Choose a backup location',
        elapsedMs: 0,
        activeCollections: [],
        completedCollections: 0,
        logTail: [],
        mayHavePartialChanges: false
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
  private record(id: string, owner: WebContents): Operation {
    const record = this.records.get(id);
    if (!record || record.closed || record.owner !== owner)
      throw new Error('Database operation is closed or unavailable.');
    return record;
  }
  owns(id: string, owner: WebContents): boolean {
    const r = this.records.get(id);
    return Boolean(r && r.owner === owner && !r.closed);
  }
  snapshot(id: string, owner: WebContents): DatabaseTransferProgress {
    return { ...this.record(id, owner).progress };
  }
  private publish(record: Operation) {
    if (!record.closed && !record.owner.isDestroyed())
      record.owner.send(DATABASE_PROGRESS_CHANNEL, record.progress);
  }
  private cancelled(record: Operation): boolean {
    return Boolean(record.closed || record.progress.state === 'cancelling');
  }
  hasActiveRestore(connectionId: string, database: string): boolean {
    return this.locks.has(`${connectionId}\0${database}`);
  }
  async choosePath(
    id: string,
    owner: WebContents,
    inputKind: 'archive' | 'directory',
    gzip: boolean
  ): Promise<string | null> {
    const record = this.record(id, owner);
    if (databaseTransferActive(record.progress.state))
      throw new Error('Operation is already running.');
    if (!['archive', 'directory'].includes(inputKind) || typeof gzip !== 'boolean')
      throw new Error('Invalid backup input type.');
    const result =
      record.input.kind === 'database-backup'
        ? await dialog.showSaveDialog({
            title: 'Back up database',
            defaultPath: `${record.input.database}.archive${gzip ? '.gz' : ''}`
          })
        : await dialog.showOpenDialog({
            title:
              inputKind === 'directory'
                ? 'Choose dump root or database directory'
                : 'Choose MongoDB archive',
            properties: [inputKind === 'directory' ? 'openDirectory' : 'openFile']
          });
    this.record(id, owner);
    if (result.canceled) return null;
    if (databaseTransferActive(record.progress.state))
      throw new Error('Operation is already running.');
    const selected = 'filePaths' in result ? result.filePaths[0] : result.filePath;
    if (!selected) return null;
    record.selection = { inputKind, gzip };
    record.progress = {
      ...record.progress,
      state: 'configuring',
      phase: 'Ready',
      filePath: selected,
      error: undefined
    };
    this.publish(record);
    return selected;
  }
  async start(id: string, owner: WebContents, options: DatabaseTransferOptions): Promise<void> {
    if (this.shuttingDown) throw new Error('Application is shutting down.');
    const record = this.record(id, owner);
    validateDatabaseOptions(record.input, options);
    if (databaseTransferActive(record.progress.state) || record.busy)
      throw new Error('Operation is running or finishing cleanup.');
    const selected = record.selection;
    const filePath = record.progress.filePath;
    if (
      !selected ||
      !filePath ||
      selected.gzip !== options.gzip ||
      (options.kind === 'database-restore' && selected.inputKind !== options.inputKind)
    )
      throw new Error('Choose a file/directory for the selected input and compression first.');
    const conn = this.connection(record.input.connectionId);
    if (!conn) throw new Error('Connection no longer exists.');
    if (options.kind === 'database-restore') {
      const lock = `${record.input.connectionId}\0${options.targetDatabase}`;
      if (this.locks.has(lock) || this.hasImport(record.input.connectionId, options.targetDatabase))
        throw new Error('Another import/restore is using this target database.');
      this.locks.add(lock);
      record.lock = lock;
    }
    const runId = randomUUID();
    record.runId = runId;
    record.busy = true;
    record.done = new Promise((resolve) => {
      record.finish = resolve;
    });
    record.progress = {
      tabId: id,
      state: 'checking',
      phase: 'Checking MongoDB tools',
      filePath,
      elapsedMs: 0,
      activeCollections: [],
      completedCollections: 0,
      logTail: [],
      mayHavePartialChanges: false
    };
    this.publish(record);
    try {
      const name = record.input.kind === 'database-backup' ? 'mongodump' : 'mongorestore';
      const settings = this.settings();
      const tool = await this.tools.resolve(
        name,
        name === 'mongodump' ? settings.mongodumpPath : settings.mongorestorePath
      );
      if (this.cancelled(record)) throw new Error('Operation cancelled.');
      if (!tool.available || !tool.path)
        throw new Error(tool.error ?? 'Database tool is unavailable.');
      if (options.kind === 'database-restore' && options.mode === 'replace-collections') {
        const result = await dialog.showMessageBox({
          type: 'warning',
          title: 'Replace backed-up collections',
          message: `Replace backed-up collections in "${options.targetDatabase}"?`,
          detail:
            'Collections present in the backup will be dropped and recreated. Unrelated collections remain. Cancellation or failure does not roll back changes.',
          buttons: ['Cancel', 'Replace collections'],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        });
        if (result.response !== 1) throw new Error('Replacement was not confirmed.');
      }
      if (this.cancelled(record)) throw new Error('Operation cancelled.');
      const workDir = path.join(app.getPath('userData'), 'database-tool-jobs', runId);
      await mkdir(workDir, { recursive: true, mode: 0o700 });
      const job: DatabaseTransferJob = {
        tabId: id,
        runId,
        input: record.input,
        options,
        connection: conn,
        filePath,
        executable: tool.path,
        workDir
      };
      record.job = job;
      if (this.cancelled(record)) throw new Error('Operation cancelled.');
      const worker = this.fork();
      record.worker = worker;
      worker.on('message', (message) => {
        if (record.runId !== runId || record.worker !== worker) return;
        if (message.kind === 'child') {
          record.childPid =
            message.pid && Number.isSafeInteger(message.pid) && message.pid > 0
              ? message.pid
              : undefined;
          if (record.progress.state === 'cancelling' && record.childPid)
            void terminateTool(record.childPid);
        } else {
          const cancelling = record.progress.state === 'cancelling';
          record.progress = {
            ...message.progress,
            ...(cancelling && databaseTransferActive(message.progress.state)
              ? { state: 'cancelling' as const }
              : {})
          };
          this.publish(record);
        }
      });
      worker.on('exit', () => {
        void this.cleanup(id, record, runId);
      });
      worker.postMessage({ kind: 'start', job });
    } catch (error) {
      const cancelled = record.closed || record.progress.state === 'cancelling';
      record.progress = {
        ...record.progress,
        state: cancelled ? 'cancelled' : 'failed',
        phase: cancelled ? 'Cancelled' : 'Failed',
        error: error instanceof Error ? error.message : String(error)
      };
      this.publish(record);
      if (record.worker) record.worker.kill();
      else await this.cleanup(id, record, runId);
    }
  }
  private async cleanup(id: string, record: Operation, runId: string): Promise<void> {
    if (record.runId !== runId) return;
    if (record.timer) clearTimeout(record.timer);
    if (record.childPid) await terminateTool(record.childPid, true);
    record.childPid = undefined;
    if (record.job) {
      await rm(record.job.workDir, { recursive: true, force: true }).catch(() => {});
      if (record.input.kind === 'database-backup')
        await rm(`${record.job.filePath}.dinodb-${runId}.partial`, { force: true }).catch(() => {});
    }
    if (databaseTransferActive(record.progress.state)) {
      const cancelled = record.closed || record.progress.state === 'cancelling';
      record.progress = {
        ...record.progress,
        state: cancelled ? 'cancelled' : 'failed',
        phase: cancelled ? 'Cancelled' : 'Worker stopped',
        mayHavePartialChanges: record.input.kind === 'database-restore',
        error:
          'The worker stopped. Review the last reported results; a restore may have partial changes.'
      };
      this.publish(record);
    }
    if (record.lock) this.locks.delete(record.lock);
    record.lock = undefined;
    record.timer = undefined;
    record.job = undefined;
    record.worker = undefined;
    record.busy = false;
    record.finish?.();
    record.finish = undefined;
    if (record.closed) this.records.delete(id);
  }
  cancel(id: string, owner: WebContents): void {
    this.cancelRecord(this.record(id, owner));
  }
  private cancelRecord(record: Operation): void {
    if (!databaseTransferActive(record.progress.state) || record.progress.state === 'cancelling')
      return;
    record.progress = { ...record.progress, state: 'cancelling', phase: 'Stopping MongoDB tool' };
    this.publish(record);
    try {
      record.worker?.postMessage({ kind: 'cancel' });
    } catch {
      /* Exit may race cancellation; forced cleanup still runs. */
    }
    record.timer = setTimeout(() => {
      void (async () => {
        if (record.childPid) await terminateTool(record.childPid, true);
        record.worker?.kill();
      })();
    }, 6000);
  }
  close(id: string): void {
    const record = this.records.get(id);
    if (!record) return;
    record.closed = true;
    this.cancelRecord(record);
    if (!record.done || !databaseTransferActive(record.progress.state)) {
      if (!record.worker) this.records.delete(id);
    }
  }
  closeForConnection(connectionId: string): void {
    for (const [id, record] of this.records)
      if (record.input.connectionId === connectionId) this.close(id);
  }
  async disposeAll(): Promise<void> {
    this.shuttingDown = true;
    const records = [...this.records.values()];
    for (const record of records) this.cancelRecord(record);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all(records.map((record) => record.done)),
        new Promise((resolve) => {
          deadline = setTimeout(resolve, 8000);
        })
      ]);
    } finally {
      if (deadline) clearTimeout(deadline);
    }
    await Promise.all(
      records.map(async (record) => {
        if (record.childPid) await terminateTool(record.childPid, true);
        record.worker?.kill();
      })
    );
    let finalDeadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all(records.map((record) => record.done)),
        new Promise((resolve) => {
          finalDeadline = setTimeout(resolve, 2000);
        })
      ]);
    } finally {
      if (finalDeadline) clearTimeout(finalDeadline);
    }
  }
}
