import { afterEach, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readdir, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConnectionConfig } from '../../shared/types';
import type { ShellProgress } from '../../shared/shell';
import { runShell, shellBootstrap } from './shell-runner';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const connection: ConnectionConfig = {
  id: 'fixture',
  name: 'Fixture',
  host: 'localhost',
  port: 27017,
  username: 'tester',
  password: 'private-secret',
  defaultDatabase: 'authentication_db',
  authSource: '',
  authMechanism: '',
  authMechanismProperties: '',
  extraOptions: '',
  createdAt: 0,
  updatedAt: 0,
  lastConnectedAt: null
};
async function fixture(code: string) {
  const dir = await mkdtemp(join(tmpdir(), 'dinodb-shell-test-'));
  dirs.push(dir);
  const file = join(dir, 'fixture.cjs');
  await writeFile(file, code);
  const events: ShellProgress[] = [];
  const controller = new AbortController();
  let argv: string[] = [];
  let bootstrap = '';
  let privateMode = 0;
  const spawnFixture: typeof spawn = ((
    executable: string,
    args: string[],
    options: Parameters<typeof spawn>[2]
  ) => {
    argv = args;
    return spawn(process.execPath, [file, ...args], {
      ...options,
      env: { ...options?.env, ELECTRON_RUN_AS_NODE: '1' }
    });
  }) as typeof spawn;
  return {
    dir,
    controller,
    events,
    argv: () => argv,
    bootstrap: () => bootstrap,
    mode: () => privateMode,
    run: (timeoutMs = 10000) =>
      runShell(
        {
          tabId: 'shell',
          executable: process.execPath,
          connection,
          database: 'selected',
          script: 'print("script");',
          tempRoot: dir,
          timeoutMs
        },
        controller.signal,
        async (progress) => {
          events.push(progress);
          if (progress.state === 'running') {
            bootstrap = await readFile(argv.at(-1)!, 'utf8').catch(() => bootstrap);
            privateMode = (await stat(argv.at(-1)!).catch(() => null))?.mode ?? privateMode;
          }
        },
        spawnFixture
      )
  };
}

it('runs a real child, keeps credentials out of arguments, preserves auth DB and cleans private files', async () => {
  const ctx = await fixture(
    `console.log('hello'); setTimeout(() => console.log('private-secret mongodb://user:password@localhost/'), 100);`
  );
  await ctx.run();
  expect(ctx.events.at(-1)).toMatchObject({ state: 'completed', exitCode: 0 });
  expect(ctx.events.at(-1)?.output).toContain('hello');
  expect(ctx.events.some((e) => e.output.includes('private-secret'))).toBe(false);
  expect(ctx.argv().join(' ')).not.toContain('private-secret');
  expect(ctx.bootstrap()).toContain('/authentication_db');
  expect(ctx.bootstrap()).toContain('getSiblingDB("selected")');
  if (process.platform !== 'win32') expect(ctx.mode() & 0o777).toBe(0o600);
  expect(await readdir(ctx.dir)).toEqual(['fixture.cjs']);
});

it('reports script errors, bounds streamed output and cleans on failure', async () => {
  const ctx = await fixture(
    `for(let i=0;i<2000;i++)console.log('a'.repeat(100)); console.error('script failed'); process.exitCode=2;`
  );
  await ctx.run();
  expect(ctx.events.at(-1)).toMatchObject({ state: 'failed', exitCode: 2, truncated: true });
  expect(ctx.events.at(-1)!.output.length).toBeLessThanOrEqual(64000);
  expect(ctx.events.at(-1)!.output).toContain('script failed');
  expect(await readdir(ctx.dir)).toEqual(['fixture.cjs']);
});

it('cancels an owned process and cleans temporary credentials', async () => {
  const ctx = await fixture(`console.log('ready'); setInterval(() => {}, 1000);`);
  const done = ctx.run();
  const timer = setInterval(() => {
    if (ctx.events.some((e) => e.output.includes('ready'))) ctx.controller.abort();
  }, 20);
  try {
    await done;
  } finally {
    clearInterval(timer);
  }
  expect(ctx.events.at(-1)).toMatchObject({ state: 'cancelled' });
  expect(await readdir(ctx.dir)).toEqual(['fixture.cjs']);
});

it('enforces a timeout and reports failure rather than successful cancellation', async () => {
  const ctx = await fixture(`setInterval(() => {}, 1000);`);
  await ctx.run(150);
  expect(ctx.events.at(-1)).toMatchObject({
    state: 'failed',
    error: expect.stringContaining('timeout')
  });
  expect(await readdir(ctx.dir)).toEqual(['fixture.cjs']);
});

it('forces termination when a shell ignores SIGINT', async () => {
  const ctx = await fixture(
    `process.on('SIGINT',()=>{}); console.log('pid:'+process.pid); setInterval(()=>{},1000);`
  );
  const done = ctx.run();
  const timer = setInterval(() => {
    if (ctx.events.some((e) => e.output.includes('pid:'))) ctx.controller.abort();
  }, 20);
  try {
    await done;
  } finally {
    clearInterval(timer);
  }
  expect(ctx.events.at(-1)?.state).toBe('cancelled');
  const pid = Number(ctx.events.at(-1)?.output.match(/pid:(\d+)/)?.[1]);
  expect(pid).toBeGreaterThan(0);
  expect(() => process.kill(pid, 0)).toThrow();
  expect(await readdir(ctx.dir)).toEqual(['fixture.cjs']);
}, 15000);

it('does not launch after startup cancellation and safely quotes database/script paths', async () => {
  const ctx = await fixture(`process.exit(99)`);
  ctx.controller.abort();
  await ctx.run();
  expect(ctx.argv()).toEqual([]);
  expect(ctx.events.at(-1)?.state).toBe('cancelled');
  expect(shellBootstrap('mongodb://localhost/', 'db"name', 'C:\\a"b.js')).toContain(
    'getSiblingDB("db\\"name")'
  );
});
