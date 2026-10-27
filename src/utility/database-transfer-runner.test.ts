import { afterEach, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MongoClient } from 'mongodb';
import type { ConnectionConfig } from '../shared/types';
import type {
  DatabaseTransferJob,
  DatabaseFromWorker,
  DatabaseTransferProgress
} from '../shared/database-transfer';
import { runDatabaseTransfer } from './database-transfer-runner';
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});
async function setup(restore = false) {
  const dir = await mkdtemp(join(tmpdir(), 'nexdb-process-'));
  dirs.push(dir);
  const filePath = join(dir, 'backup.archive');
  await writeFile(filePath, 'existing backup');
  const script = join(dir, 'tool.cjs');
  const events: DatabaseFromWorker[] = [];
  const abort = new AbortController();
  const connection = {
    id: 'c',
    name: 'fixture',
    host: 'localhost',
    port: 27017,
    defaultDatabase: '',
    username: 'user',
    password: 'private-password',
    authSource: 'admin',
    authMechanism: '',
    authMechanismProperties: '',
    extraOptions: '',
    createdAt: 0,
    updatedAt: 0,
    lastConnectedAt: null
  } as ConnectionConfig;
  const job: DatabaseTransferJob = {
    tabId: 'id',
    runId: 'run',
    connection,
    executable: '/fake/tool',
    filePath,
    workDir: join(dir, 'credentials'),
    input: {
      kind: restore ? 'database-restore' : 'database-backup',
      connectionId: 'c',
      database: 'source'
    },
    options: restore
      ? {
          kind: 'database-restore',
          sourceDatabase: 'source',
          targetDatabase: 'target',
          inputKind: 'archive',
          gzip: false,
          mode: 'new-database'
        }
      : { kind: 'database-backup', gzip: false }
  };
  const listDatabases = vi.fn(async () => ({ databases: [] }));
  const client = {
    connect: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    db: () => ({ admin: () => ({ listDatabases }) })
  } as unknown as MongoClient;
  const spawnTool = vi.fn((_file, args, options) =>
    spawn(process.execPath, [script, ...args], {
      ...options,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    })
  ) as unknown as typeof spawn;
  async function run(body: string) {
    await writeFile(script, body);
    await runDatabaseTransfer(job, abort.signal, (event) => events.push(event), {
      createClient: () => client,
      spawn: spawnTool
    });
  }
  const final = () =>
    (
      events.filter((event) => event.kind === 'progress').at(-1) as {
        kind: 'progress';
        progress: DatabaseTransferProgress;
      }
    ).progress;
  return { dir, script, job, abort, events, client, listDatabases, spawnTool, run, final };
}
it('runs a real child process without shell, publishes a completed backup and removes secrets', async () => {
  const ctx = await setup();
  await ctx.run(
    "const fs=require('node:fs'); const arg=process.argv.find(a=>a.startsWith('--archive=')); fs.writeFileSync(arg.slice(10),'archive bytes'); console.error('done dumping source.users (1 document)');"
  );
  expect(ctx.final()).toMatchObject({ state: 'completed', bytes: 13 });
  expect(await readFile(ctx.job.filePath, 'utf8')).toBe('archive bytes');
  expect(await readdir(ctx.dir)).toEqual(expect.arrayContaining(['backup.archive', 'tool.cjs']));
  await expect(stat(ctx.job.workDir)).rejects.toThrow();
  expect(ctx.spawnTool).toHaveBeenCalledWith(
    '/fake/tool',
    expect.any(Array),
    expect.objectContaining({ shell: false, windowsHide: true })
  );
});
it('preserves an existing output on nonzero exit and redacts tool diagnostics', async () => {
  const ctx = await setup();
  await ctx.run(
    "console.error('Failed: private-password mongodb://user:private-password@localhost'); process.exit(2);"
  );
  expect(ctx.final().state).toBe('failed');
  expect(JSON.stringify(ctx.events)).not.toContain('private-password');
  expect(await readFile(ctx.job.filePath, 'utf8')).toBe('existing backup');
});
it('restores only after a matching dry run and marks possible partial changes', async () => {
  const ctx = await setup(true);
  await ctx.run(
    "if(process.argv.includes('--dryRun')) console.error('reading metadata for source.users from dump'); else console.error('finished restoring target.users (2 documents, 0 failures)');"
  );
  expect(ctx.final()).toMatchObject({ state: 'completed', mayHavePartialChanges: true });
  expect(ctx.spawnTool).toHaveBeenCalledTimes(2);
  expect(ctx.listDatabases).toHaveBeenCalledTimes(2);
});
it('blocks no-match backups before any restoring process is started', async () => {
  const ctx = await setup(true);
  await ctx.run("console.error('reading metadata for unrelated.users from dump');");
  expect(ctx.final()).toMatchObject({
    state: 'failed',
    mayHavePartialChanges: false,
    error: expect.stringContaining('No verified')
  });
  expect(ctx.spawnTool).toHaveBeenCalledTimes(1);
});
it('refuses a new-database restore if the target exists', async () => {
  const ctx = await setup(true);
  ctx.listDatabases.mockResolvedValue({ databases: [{ name: 'target' }] } as never);
  await ctx.run('process.exit(0)');
  expect(ctx.final().state).toBe('failed');
  expect(ctx.spawnTool).not.toHaveBeenCalled();
});
it('cancels an owned process and cleans its configuration', async () => {
  const ctx = await setup(true);
  const promise = ctx.run(
    "if(process.argv.includes('--dryRun')) console.error('reading metadata for source.users from dump'); else { console.error('restoring target.users'); setInterval(()=>{},1000); }"
  );
  const deadline = Date.now() + 10000;
  while (
    !ctx.events.some((event) => event.kind === 'progress' && event.progress.mayHavePartialChanges)
  ) {
    if (Date.now() > deadline) throw new Error('Fixture process did not start.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  ctx.abort.abort();
  await promise;
  expect(ctx.final()).toMatchObject({ state: 'cancelled', mayHavePartialChanges: true });
  await expect(stat(ctx.job.workDir)).rejects.toThrow();
  expect(ctx.events.filter((event) => event.kind === 'child').at(-1)).toEqual({
    kind: 'child',
    pid: null
  });
}, 15000);
it('accepts a selected database directory by using its dump root with namespace filtering', async () => {
  const ctx = await setup(true);
  const { mkdir } = await import('node:fs/promises');
  const databaseDir = join(ctx.dir, 'source');
  await mkdir(databaseDir);
  await writeFile(join(databaseDir, 'users.bson'), 'fixture');
  ctx.job.filePath = databaseDir;
  ctx.job.options = {
    kind: 'database-restore',
    inputKind: 'directory',
    gzip: false,
    sourceDatabase: 'source',
    targetDatabase: 'target',
    mode: 'new-database'
  };
  await ctx.run(
    "console.error('found collection `source.users` bson to restore to `target.users`');"
  );
  expect(ctx.final().state).toBe('completed');
  const args = vi.mocked(ctx.spawnTool).mock.calls[0][1] as string[];
  expect(args).toEqual(expect.arrayContaining(['--dir', ctx.dir, '--nsInclude=source.*']));
});
it('does not turn reported document/index failures into success even with exit code zero', async () => {
  const ctx = await setup(true);
  await ctx.run(
    "if(process.argv.includes('--dryRun')) console.error('found collection `source.users` bson'); else console.error('finished restoring target.users (1 document, 1 failure)');"
  );
  expect(ctx.final()).toMatchObject({ state: 'failed', mayHavePartialChanges: true });
});
it('forces an unresponsive child to stop instead of leaving it running', async () => {
  const ctx = await setup(true);
  const running = ctx.run(
    "if(process.argv.includes('--dryRun')) console.error('found collection `source.users` bson'); else { process.on('SIGINT',()=>{}); console.error('restoring target.users'); setInterval(()=>{},1000); }"
  );
  const deadline = Date.now() + 10000;
  while (
    !ctx.events.some(
      (event) =>
        event.kind === 'progress' &&
        event.progress.logTail.some((line) => line.includes('restoring target.users'))
    )
  ) {
    if (Date.now() > deadline) throw new Error('Fixture child did not start.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  ctx.abort.abort();
  await running;
  expect(ctx.final().state).toBe('cancelled');
  expect(ctx.events.filter((event) => event.kind === 'child').at(-1)).toEqual({
    kind: 'child',
    pid: null
  });
}, 15000);
