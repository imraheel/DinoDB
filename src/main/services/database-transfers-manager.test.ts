import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WebContents } from 'electron';
import type { ConnectionConfig } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';
import type { DatabaseToWorker, DatabaseTransferOptions } from '../../shared/database-transfer';
import type { DatabaseTools } from './database-tools';
const state = vi.hoisted(() => ({ dir: '' }));
vi.mock('electron', () => ({
  app: { getPath: () => state.dir },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
  utilityProcess: { fork: vi.fn() }
}));
vi.mock('../../shared/tool-process', () => ({ terminateTool: vi.fn(async () => {}) }));
import { dialog } from 'electron';
import { terminateTool } from '../../shared/tool-process';
import { DatabaseTransfersManager, type DatabaseWorker } from './database-transfers-manager';
class Worker extends EventEmitter {
  messages: DatabaseToWorker[] = [];
  postMessage(message: DatabaseToWorker) {
    this.messages.push(message);
  }
  kill = vi.fn(() => {
    this.emit('exit', 1);
    return true;
  });
}
const dirs: string[] = [];
const instances: { manager: DatabaseTransfersManager; workers: Worker[] }[] = [];
const options: DatabaseTransferOptions = {
  kind: 'database-restore',
  inputKind: 'archive',
  gzip: true,
  sourceDatabase: 'source',
  targetDatabase: 'target',
  mode: 'new-database'
};
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'nexdb-manager-'));
  dirs.push(dir);
  state.dir = dir;
  const sender = Object.assign(new EventEmitter(), {
    id: 1,
    send: vi.fn(),
    isDestroyed: () => false
  }) as unknown as WebContents;
  const workers: Worker[] = [];
  const resolve = vi.fn(async () => ({
    available: true,
    path: '/tools/mongorestore',
    version: '100.19.0'
  }));
  const hasImport = vi.fn(() => false);
  const manager = new DatabaseTransfersManager(
    { resolve } as unknown as DatabaseTools,
    () => DEFAULT_SETTINGS,
    () => ({ id: 'c' }) as ConnectionConfig,
    hasImport,
    () => {
      const worker = new Worker();
      workers.push(worker);
      return worker as DatabaseWorker;
    }
  );
  instances.push({ manager, workers });
  const id = manager.create(
    { kind: 'database-restore', connectionId: 'c', database: 'source' },
    sender
  );
  vi.mocked(dialog.showOpenDialog).mockResolvedValue({
    canceled: false,
    filePaths: [join(dir, 'backup')]
  });
  vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false });
  await manager.choosePath(id, sender, 'archive', true);
  return { manager, workers, id, sender, resolve, hasImport };
}
afterEach(async () => {
  for (const { manager, workers } of instances.splice(0)) {
    workers.forEach((worker) => worker.kill());
    await manager.disposeAll();
  }
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  vi.clearAllMocks();
});
it('uses separate workers, restricts snapshot ownership and prevents overlapping restores', async () => {
  const ctx = await setup();
  await ctx.manager.start(ctx.id, ctx.sender, options);
  expect(ctx.workers).toHaveLength(1);
  expect(ctx.manager.hasActiveRestore('c', 'target')).toBe(true);
  expect(() => ctx.manager.snapshot(ctx.id, {} as WebContents)).toThrow();
  await expect(ctx.manager.start(ctx.id, ctx.sender, options)).rejects.toThrow('running');
  const other = ctx.manager.create(
    { kind: 'database-restore', connectionId: 'c', database: 'source' },
    ctx.sender
  );
  await ctx.manager.choosePath(other, ctx.sender, 'archive', true);
  await expect(ctx.manager.start(other, ctx.sender, options)).rejects.toThrow(
    'Another import/restore'
  );
});
it('retains cancellation tracking and the target lock after a tab closes until its worker exits', async () => {
  const ctx = await setup();
  await ctx.manager.start(ctx.id, ctx.sender, options);
  ctx.manager.close(ctx.id);
  expect(ctx.workers[0].messages.at(-1)).toEqual({ kind: 'cancel' });
  expect(ctx.manager.hasActiveRestore('c', 'target')).toBe(true);
  ctx.workers[0].emit('exit', 1);
  await vi.waitFor(() => expect(ctx.manager.hasActiveRestore('c', 'target')).toBe(false));
});
it('terminates a registered tool when its supervising worker crashes', async () => {
  const ctx = await setup();
  await ctx.manager.start(ctx.id, ctx.sender, options);
  ctx.workers[0].emit('message', { kind: 'child', pid: 12345 });
  ctx.workers[0].emit('exit', 1);
  await vi.waitFor(() => expect(ctx.manager.snapshot(ctx.id, ctx.sender).state).toBe('failed'));
  expect(terminateTool).toHaveBeenCalledWith(12345, true);
});
it('requires main-owned confirmation for replacement and does not start if declined', async () => {
  const ctx = await setup();
  vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 0, checkboxChecked: false });
  await ctx.manager.start(ctx.id, ctx.sender, {
    ...options,
    mode: 'replace-collections'
  } as DatabaseTransferOptions);
  expect(ctx.workers).toHaveLength(0);
  expect(ctx.manager.snapshot(ctx.id, ctx.sender).state).toBe('failed');
  expect(ctx.manager.hasActiveRestore('c', 'target')).toBe(false);
});
it('blocks a restore when an import is still using the target database', async () => {
  const ctx = await setup();
  ctx.hasImport.mockReturnValue(true);
  await expect(ctx.manager.start(ctx.id, ctx.sender, options)).rejects.toThrow(
    'Another import/restore'
  );
});
it('reports missing tools and releases its lock', async () => {
  const ctx = await setup();
  ctx.resolve.mockResolvedValueOnce({ available: false, path: '', version: '' });
  await ctx.manager.start(ctx.id, ctx.sender, options);
  expect(ctx.manager.snapshot(ctx.id, ctx.sender).state).toBe('failed');
  expect(ctx.manager.hasActiveRestore('c', 'target')).toBe(false);
});
it('cancels when the initiating renderer is destroyed', async () => {
  const ctx = await setup();
  await ctx.manager.start(ctx.id, ctx.sender, options);
  ctx.sender.emit('destroyed');
  expect(ctx.workers[0].messages.at(-1)).toEqual({ kind: 'cancel' });
  expect(() => ctx.manager.snapshot(ctx.id, ctx.sender)).toThrow();
});
it('permits restore setup from a system database menu while rejecting system targets', async () => {
  const ctx = await setup();
  expect(() =>
    ctx.manager.create(
      { kind: 'database-restore', connectionId: 'c', database: 'admin' },
      ctx.sender
    )
  ).not.toThrow();
  await expect(
    ctx.manager.start(ctx.id, ctx.sender, {
      ...options,
      targetDatabase: 'admin'
    } as DatabaseTransferOptions)
  ).rejects.toThrow();
});
it('refuses new operations once shutdown has begun', async () => {
  const ctx = await setup();
  await ctx.manager.disposeAll();
  expect(() =>
    ctx.manager.create(
      { kind: 'database-backup', connectionId: 'c', database: 'source' },
      ctx.sender
    )
  ).toThrow('shutting down');
});
