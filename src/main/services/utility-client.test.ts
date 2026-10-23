import { describe, expect, it } from 'vitest';
import type { InitMessage, MainToUtility, UtilityToMain } from '../../shared/ipc';
import type { ConnectionConfig } from '../../shared/types';
import { UtilityClient } from './utility-client';
import type { ForkedProcess, UtilityClientDeps } from './utility-client';

class FakeProcess implements ForkedProcess {
  readonly posted: MainToUtility[] = [];
  killed = false;
  private readonly messageListeners: Array<(message: UtilityToMain) => void> = [];
  private readonly exitListeners: Array<(code: number | null) => void> = [];

  postMessage(message: MainToUtility): void {
    this.posted.push(message);
  }

  on(event: 'message', listener: (message: UtilityToMain) => void): void;
  on(event: 'exit', listener: (code: number | null) => void): void;
  on(
    event: 'message' | 'exit',
    listener: ((message: UtilityToMain) => void) | ((code: number | null) => void)
  ): void {
    if (event === 'message')
      this.messageListeners.push(listener as (message: UtilityToMain) => void);
    else this.exitListeners.push(listener as (code: number | null) => void);
  }

  kill(): boolean {
    this.killed = true;
    return true;
  }

  emitMessage(message: UtilityToMain): void {
    for (const listener of [...this.messageListeners]) listener(message);
  }

  emitExit(code: number | null): void {
    for (const listener of [...this.exitListeners]) listener(code);
  }
}

interface Harness {
  deps: UtilityClientDeps;
  process: () => FakeProcess;
}

function makeHarness(): Harness {
  let current: FakeProcess | null = null;
  return {
    deps: {
      resolveScriptPath: () => '/fake/out/utility/index.js',
      fork: () => {
        current = new FakeProcess();
        return current;
      }
    },
    process: () => {
      if (current === null) throw new Error('no process forked yet');
      return current;
    }
  };
}

function baseConnection(): ConnectionConfig {
  return {
    id: 'conn-1',
    name: 'Local',
    host: '127.0.0.1',
    port: 27017,
    defaultDatabase: 'test',
    username: '',
    password: '',
    authMechanism: '',
    authSource: '',
    authMechanismProperties: '',
    extraOptions: '',
    createdAt: 0,
    updatedAt: 0,
    lastConnectedAt: null
  };
}

function initMessage(): InitMessage {
  return { role: 'session', connection: baseConnection() };
}

async function startedClient(
  harness: Harness
): Promise<{ client: UtilityClient; proc: FakeProcess }> {
  const client = new UtilityClient('test', harness.deps);
  const promise = client.start(initMessage());
  const proc = harness.process();
  proc.emitMessage({ kind: 'ready' });
  await promise;
  return { client, proc };
}

describe('utility-client', () => {
  it('start resolves when the child reports ready and posts init first', async () => {
    const harness = makeHarness();
    const client = new UtilityClient('test', harness.deps);
    const promise = client.start(initMessage());
    const proc = harness.process();
    expect(proc.posted[0]).toEqual({ kind: 'init', init: initMessage() });
    proc.emitMessage({ kind: 'ready' });
    await expect(promise).resolves.toBeUndefined();
    client.dispose();
  });

  it('start rejects when the child reports fatal', async () => {
    const harness = makeHarness();
    const client = new UtilityClient('test', harness.deps);
    const promise = client.start(initMessage());
    const proc = harness.process();
    proc.emitMessage({ kind: 'fatal', error: 'authentication failed' });
    await expect(promise).rejects.toThrow('authentication failed');
    client.dispose();
    expect(proc.killed).toBe(true);
  });

  it('correlates responses out of order', async () => {
    const harness = makeHarness();
    const { client, proc } = await startedClient(harness);
    const first = client.request({ kind: 'ping' }, { timeoutMs: 1000, maxTimeMs: 1000 });
    const second = client.request({ kind: 'listDatabases' }, { timeoutMs: 1000, maxTimeMs: 1000 });
    expect(proc.posted[1]).toMatchObject({ kind: 'request', id: 1 });
    expect(proc.posted[2]).toMatchObject({ kind: 'request', id: 2 });
    proc.emitMessage({
      kind: 'response',
      id: 2,
      ok: true,
      result: { databases: ['alpha', 'beta'] }
    });
    proc.emitMessage({ kind: 'response', id: 1, ok: true, result: { version: '8.0.0' } });
    await expect(first).resolves.toEqual({ version: '8.0.0' });
    await expect(second).resolves.toEqual({ databases: ['alpha', 'beta'] });
    client.dispose();
  });

  it('rejects a request when it times out', async () => {
    const harness = makeHarness();
    const { client } = await startedClient(harness);
    const promise = client.request({ kind: 'ping' }, { timeoutMs: 20, maxTimeMs: 10 });
    await expect(promise).rejects.toThrow(/timed out/);
    client.dispose();
  });

  it('fails pending requests when the child exits', async () => {
    const harness = makeHarness();
    const { client, proc } = await startedClient(harness);
    const promise = client.request({ kind: 'ping' }, { timeoutMs: 1000, maxTimeMs: 1000 });
    proc.emitExit(1);
    await expect(promise).rejects.toThrow(/exited/);
    await expect(
      client.request({ kind: 'ping' }, { timeoutMs: 1000, maxTimeMs: 1000 })
    ).rejects.toThrow(/not running/);
    client.dispose();
  });

  it('rejects a request made before start', async () => {
    const harness = makeHarness();
    const client = new UtilityClient('test', harness.deps);
    await expect(
      client.request({ kind: 'ping' }, { timeoutMs: 1000, maxTimeMs: 1000 })
    ).rejects.toThrow(/not running/);
    client.dispose();
  });
});
