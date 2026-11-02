import { randomUUID } from 'node:crypto';
import { app, type WebContents } from 'electron';
import type { AppSettings, ConnectionConfig } from '../../shared/types';
import { shellActive, type ShellContext, type ShellProgress } from '../../shared/shell';
import type { DatabaseTools } from './database-tools';
import { runShell } from './shell-runner';

interface ShellRecord {
  context: ShellContext;
  owner: WebContents;
  progress: ShellProgress;
  controller?: AbortController;
  done?: Promise<void>;
  closed?: boolean;
}
export class ShellsManager {
  private records = new Map<string, ShellRecord>();
  private shuttingDown = false;
  private owners = new Set<number>();
  constructor(
    private tools: DatabaseTools,
    private settings: () => AppSettings,
    private connection: (id: string) => ConnectionConfig | null,
    private runner: typeof runShell = runShell
  ) {}
  create(context: ShellContext, owner: WebContents): string {
    if (this.shuttingDown) throw new Error('Application is shutting down.');
    if (
      !context ||
      typeof context.connectionId !== 'string' ||
      !this.connection(context.connectionId) ||
      typeof context.database !== 'string' ||
      !context.database ||
      context.database.includes('\0') ||
      typeof context.collection !== 'string' ||
      context.collection.includes('\0')
    )
      throw new Error('Invalid shell context.');
    const id = randomUUID();
    this.records.set(id, {
      context: { ...context },
      owner,
      progress: { tabId: id, state: 'idle', output: '', truncated: false, elapsedMs: 0 }
    });
    if (!this.owners.has(owner.id)) {
      this.owners.add(owner.id);
      owner.once('destroyed', () => {
        this.owners.delete(owner.id);
        for (const [id, record] of this.records) if (record.owner === owner) this.close(id);
      });
    }
    return id;
  }
  owns(id: string, owner: WebContents): boolean {
    const record = this.records.get(id);
    return Boolean(record && record.owner === owner && !record.closed);
  }
  private record(id: string, owner: WebContents): ShellRecord {
    const record = this.records.get(id);
    if (!record || record.owner !== owner || record.closed)
      throw new Error('Shell tab is closed or unavailable.');
    return record;
  }
  snapshot(id: string, owner: WebContents): ShellProgress {
    return { ...this.record(id, owner).progress };
  }
  private publish(record: ShellRecord, progress: ShellProgress) {
    record.progress = progress;
    if (!record.closed && !record.owner.isDestroyed())
      record.owner.send('shells:progress', progress);
  }
  start(id: string, owner: WebContents, script: string): void {
    const record = this.record(id, owner);
    if (this.shuttingDown) throw new Error('Application is shutting down.');
    if (record.done || shellActive(record.progress.state))
      throw new Error('Shell is already running.');
    if (typeof script !== 'string' || !script.trim() || Buffer.byteLength(script) > 1024 * 1024)
      throw new Error('Enter a script under 1 MiB.');
    const connection = this.connection(record.context.connectionId);
    if (!connection) throw new Error('Saved connection no longer exists.');
    record.controller = new AbortController();
    this.publish(record, {
      tabId: id,
      state: 'starting',
      output: '',
      elapsedMs: 0,
      truncated: false
    });
    const controller = record.controller;
    const settings = this.settings();
    record.done = (async () => {
      try {
        const status = await this.tools.resolve('mongosh', settings.mongoshPath);
        if (controller.signal.aborted) throw new Error('Script stopped.');
        if (!status.available || !status.path)
          throw new Error(
            status.error ?? 'Mongosh is unavailable. Check Database Tools preferences.'
          );
        await this.runner(
          {
            tabId: id,
            executable: status.path,
            connection,
            database: record.context.database,
            script,
            tempRoot: app.getPath('temp'),
            timeoutMs: Math.max(1000, Math.min(300000, settings.maxTimeMs))
          },
          controller.signal,
          (progress) => this.publish(record, progress)
        );
      } catch (error) {
        this.publish(record, {
          ...record.progress,
          state: controller.signal.aborted ? 'cancelled' : 'failed',
          error: error instanceof Error ? error.message : 'Unable to start Mongosh.'
        });
      } finally {
        record.done = undefined;
        record.controller = undefined;
        if (record.closed) this.records.delete(id);
      }
    })();
  }
  cancel(id: string, owner: WebContents): void {
    const record = this.record(id, owner);
    if (record.controller) {
      record.controller.abort();
      this.publish(record, { ...record.progress, state: 'cancelling' });
    }
  }
  close(id: string): void {
    const record = this.records.get(id);
    if (!record) return;
    record.closed = true;
    record.controller?.abort();
    if (!record.done) this.records.delete(id);
  }
  closeForConnection(connectionId: string): void {
    for (const [id, record] of this.records)
      if (record.context.connectionId === connectionId) this.close(id);
  }
  async disposeAll(): Promise<void> {
    this.shuttingDown = true;
    const pending = [...this.records.values()].flatMap((record) =>
      record.done ? [record.done] : []
    );
    for (const id of this.records.keys()) this.close(id);
    await Promise.allSettled(pending);
  }
}
