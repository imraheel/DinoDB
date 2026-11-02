import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import type { DatabaseTools } from './database-tools';
import type { runShell } from './shell-runner';
import type { ConnectionConfig } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));
import { ShellsManager } from './shells-manager';

function fixture() {
  const owner = Object.assign(new EventEmitter(), {
    id: 1,
    send: vi.fn(),
    isDestroyed: () => false
  }) as unknown as WebContents;
  const other = Object.assign(new EventEmitter(), {
    id: 2,
    send: vi.fn(),
    isDestroyed: () => false
  }) as unknown as WebContents;
  const connection = { id: 'connection' } as ConnectionConfig;
  const resolve = vi.fn(async () => ({ available: true, path: '/tools/mongosh' }));
  const signals: AbortSignal[] = [];
  let complete: (() => void) | undefined;
  const runner = vi.fn<typeof runShell>(async (job, signal, send) => {
    signals.push(signal);
    send({ tabId: job.tabId, state: 'running', output: '', truncated: false, elapsedMs: 0 });
    await new Promise<void>((resolve) => {
      complete = resolve;
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
    send({
      tabId: job.tabId,
      state: signal.aborted ? 'cancelled' : 'completed',
      output: 'done',
      truncated: false,
      elapsedMs: 10
    });
  });
  const manager = new ShellsManager(
    { resolve } as unknown as DatabaseTools,
    () => DEFAULT_SETTINGS,
    (id) => (id === 'connection' ? connection : null),
    runner
  );
  const create = () =>
    manager.create({ connectionId: 'connection', database: 'db', collection: 'collection' }, owner);
  return { manager, owner, other, resolve, runner, signals, create, finish: () => complete?.() };
}

it('owns tabs by sender and rejects overlapping scripts and oversized input', async () => {
  const ctx = fixture();
  const id = ctx.create();
  expect(() => ctx.manager.snapshot(id, ctx.other)).toThrow();
  expect(() => ctx.manager.start(id, ctx.other, 'print(1)')).toThrow();
  expect(() => ctx.manager.start(id, ctx.owner, 'x'.repeat(1024 * 1024 + 1))).toThrow();
  ctx.manager.start(id, ctx.owner, 'print(1)');
  expect(() => ctx.manager.start(id, ctx.owner, 'print(2)')).toThrow('already running');
  await vi.waitFor(() => expect(ctx.runner).toHaveBeenCalledOnce());
  expect(ctx.runner.mock.calls[0][0]).toMatchObject({
    database: 'db',
    timeoutMs: DEFAULT_SETTINGS.maxTimeMs
  });
  expect(() => ctx.manager.cancel(id, ctx.other)).toThrow();
  ctx.manager.cancel(id, ctx.owner);
  expect(ctx.signals[0].aborted).toBe(true);
  await vi.waitFor(() => expect(ctx.manager.snapshot(id, ctx.owner).state).toBe('cancelled'));
  ctx.manager.start(id, ctx.owner, 'print(3)');
  await ctx.manager.disposeAll();
});

it('handles cancellation while resolving tools without launching a child', async () => {
  const ctx = fixture();
  let resolveProbe!: (value: { available: boolean; path: string }) => void;
  ctx.resolve.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveProbe = resolve;
      })
  );
  const id = ctx.create();
  ctx.manager.start(id, ctx.owner, 'print(1)');
  ctx.manager.cancel(id, ctx.owner);
  resolveProbe({ available: true, path: '/tools/mongosh' });
  await vi.waitFor(() => expect(ctx.manager.snapshot(id, ctx.owner).state).toBe('cancelled'));
  expect(ctx.runner).not.toHaveBeenCalled();
  await ctx.manager.disposeAll();
});

it.each(['close', 'disconnect', 'destroy', 'quit'] as const)(
  'cancels owned work on %s and suppresses late output',
  async (action) => {
    const ctx = fixture();
    const id = ctx.create();
    ctx.manager.start(id, ctx.owner, 'print(1)');
    await vi.waitFor(() => expect(ctx.runner).toHaveBeenCalledOnce());
    ctx.owner.send = vi.fn();
    if (action === 'close') ctx.manager.close(id);
    else if (action === 'disconnect') ctx.manager.closeForConnection('connection');
    else if (action === 'destroy') ctx.owner.emit('destroyed');
    else await ctx.manager.disposeAll();
    expect(ctx.signals[0].aborted).toBe(true);
    await ctx.manager.disposeAll();
    expect(ctx.owner.send).not.toHaveBeenCalled();
    expect(() => ctx.manager.snapshot(id, ctx.owner)).toThrow();
    expect(() => ctx.create()).toThrow('shutting down');
  }
);

it('reports missing tools and allows a later retry', async () => {
  const ctx = fixture();
  ctx.resolve.mockResolvedValueOnce({ available: false, path: '' });
  const id = ctx.create();
  ctx.manager.start(id, ctx.owner, 'print(1)');
  await vi.waitFor(() => expect(ctx.manager.snapshot(id, ctx.owner).state).toBe('failed'));
  ctx.manager.start(id, ctx.owner, 'print(2)');
  await vi.waitFor(() => expect(ctx.runner).toHaveBeenCalledOnce());
  ctx.finish();
  await vi.waitFor(() => expect(ctx.manager.snapshot(id, ctx.owner).state).toBe('completed'));
  await ctx.manager.disposeAll();
});
