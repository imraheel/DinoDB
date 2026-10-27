import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import type { ConnectionConfig } from '../../shared/types';
import type { TransferInput, TransferProgress, TransferToWorker } from '../../shared/transfer';

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  utilityProcess: { fork: vi.fn() }
}));
import { dialog } from 'electron';
import { TransfersManager, type TransferWorker } from './transfers-manager';

class Worker extends EventEmitter {
  messages: TransferToWorker[] = [];
  postMessage(message: TransferToWorker) {
    this.messages.push(message);
  }
  kill = vi.fn(() => {
    this.emit('exit', 1);
    return true;
  });
}
function owner(id = 1): WebContents {
  return Object.assign(new EventEmitter(), {
    id,
    send: vi.fn(),
    isDestroyed: () => false
  }) as unknown as WebContents;
}
const input: TransferInput = {
  connectionId: 'conn',
  database: 'db',
  collection: 'col',
  direction: 'import'
};
const managers: TransfersManager[] = [];
function setup() {
  const workers: Worker[] = [];
  const manager = new TransfersManager(() => {
    const worker = new Worker();
    workers.push(worker);
    return worker as TransferWorker;
  });
  managers.push(manager);
  const sender = owner();
  vi.mocked(dialog.showOpenDialog).mockResolvedValue({
    canceled: false,
    filePaths: ['/tmp/import.json']
  });
  return { manager, workers, sender };
}
afterEach(() => {
  for (const manager of managers.splice(0)) manager.disposeAll();
  vi.useRealTimers();
  vi.clearAllMocks();
});
async function begin(ctx: ReturnType<typeof setup>) {
  const id = ctx.manager.create(input, ctx.sender);
  await ctx.manager.chooseFile(id, ctx.sender, 'json');
  ctx.manager.start(id, ctx.sender, 'json', {} as ConnectionConfig);
  return id;
}

it('creates a separate worker per operation and exposes the latest snapshot only to its owner', async () => {
  const ctx = setup();
  const a = await begin(ctx);
  const b = await begin(ctx);
  expect(ctx.workers).toHaveLength(2);
  expect(a).not.toBe(b);
  const progress: TransferProgress = {
    tabId: a,
    status: 'running',
    phase: 'Inserting',
    documents: 500,
    bytes: 900,
    elapsedMs: 100
  };
  ctx.workers[0].emit('message', { kind: 'progress', progress });
  expect(ctx.manager.snapshot(a, ctx.sender)).toEqual(progress);
  expect(ctx.manager.snapshot(b, ctx.sender).documents).toBe(0);
  expect(() => ctx.manager.snapshot(a, owner(2))).toThrow();
});
it('does not apply ordinary query timeouts and cancels on connection close', async () => {
  vi.useFakeTimers();
  const ctx = setup();
  await begin(ctx);
  vi.advanceTimersByTime(120000);
  expect(ctx.workers[0].kill).not.toHaveBeenCalled();
  ctx.manager.closeForConnection('conn');
  expect(ctx.workers[0].messages.at(-1)).toEqual({ kind: 'cancel' });
  vi.advanceTimersByTime(5000);
  expect(ctx.workers[0].kill).toHaveBeenCalledOnce();
});
it('preserves the file/format when the native dialog is cancelled', async () => {
  const ctx = setup();
  const id = ctx.manager.create(input, ctx.sender);
  await ctx.manager.chooseFile(id, ctx.sender, 'json');
  vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: true, filePaths: [] });
  const snapshot = await ctx.manager.chooseFile(id, ctx.sender, 'csv');
  expect(snapshot).toMatchObject({ filePath: '/tmp/import.json', format: 'json' });
  expect(() => ctx.manager.start(id, ctx.sender, 'csv', {} as ConnectionConfig)).toThrow();
});
it('reports worker crashes and uncertain acknowledged batch state', async () => {
  const ctx = setup();
  const id = await begin(ctx);
  ctx.workers[0].emit('message', {
    kind: 'progress',
    progress: { ...ctx.manager.snapshot(id, ctx.sender), status: 'running', uncertainBatch: true }
  });
  ctx.workers[0].emit('exit', 1);
  expect(ctx.manager.snapshot(id, ctx.sender)).toMatchObject({
    status: 'failed',
    uncertainBatch: true
  });
});
it('cancels when the initiating renderer is destroyed', async () => {
  const ctx = setup();
  const id = await begin(ctx);
  ctx.sender.emit('destroyed');
  expect(ctx.workers[0].messages.at(-1)).toEqual({ kind: 'cancel' });
  expect(() => ctx.manager.snapshot(id, ctx.sender)).toThrow();
});
it('rejects nested output pipelines without allocating a worker', () => {
  const ctx = setup();
  expect(() =>
    ctx.manager.create(
      {
        ...input,
        direction: 'export',
        source: { kind: 'aggregate', pipeline: [{ $facet: { output: [{ $out: 'bad' }] } }] }
      },
      ctx.sender
    )
  ).toThrow();
  expect(ctx.workers).toHaveLength(0);
});

it('reports startup failures and allows selecting a file again', async () => {
  const manager = new TransfersManager(() => {
    throw new Error('fork failed');
  });
  managers.push(manager);
  const sender = owner();
  vi.mocked(dialog.showOpenDialog).mockResolvedValue({
    canceled: false,
    filePaths: ['/tmp/data.json']
  });
  const id = manager.create(input, sender);
  await manager.chooseFile(id, sender, 'json');
  expect(() => manager.start(id, sender, 'json', {} as ConnectionConfig)).toThrow('fork failed');
  expect(manager.snapshot(id, sender)).toMatchObject({ status: 'failed', error: 'fork failed' });
  await expect(manager.chooseFile(id, sender, 'json')).resolves.toMatchObject({
    status: 'configuring'
  });
});

it('uses the .json extension for Simple JSON export dialogs and passes the format to its worker', async () => {
  const ctx = setup();
  vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({
    canceled: false,
    filePath: '/tmp/simple.json'
  });
  const id = ctx.manager.create({ ...input, direction: 'export' }, ctx.sender);
  await ctx.manager.chooseFile(id, ctx.sender, 'simple-json');
  expect(dialog.showSaveDialog).toHaveBeenCalledWith(
    expect.objectContaining({
      defaultPath: 'col.json',
      filters: [{ name: 'Simple JSON', extensions: ['json'] }]
    })
  );
  ctx.manager.start(id, ctx.sender, 'simple-json', {} as ConnectionConfig);
  expect(ctx.workers[0].messages[0]).toMatchObject({
    kind: 'start',
    job: { format: 'simple-json', filePath: '/tmp/simple.json' }
  });
});
it('accepts Simple JSON imports through a .json native file filter', async () => {
  const ctx = setup();
  const id = ctx.manager.create(input, ctx.sender);
  await ctx.manager.chooseFile(id, ctx.sender, 'simple-json');
  expect(dialog.showOpenDialog).toHaveBeenCalledWith(
    expect.objectContaining({
      filters: [{ name: 'Simple JSON', extensions: ['json'] }]
    })
  );
});
