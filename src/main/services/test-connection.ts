import type { TestConnectionResult } from '../../shared/ipc';
import type { ConnectionConfig, ConnectionInput } from '../../shared/types';
import { validateConnection } from '../../shared/validate';
import { UtilityClient } from './utility-client';
import type { UtilityClientDeps } from './utility-client';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function testConnection(
  input: ConnectionInput,
  deps: UtilityClientDeps
): Promise<TestConnectionResult> {
  const errors = validateConnection(input);
  if (errors.length > 0) return { ok: false, error: errors.join('; ') };
  const connection: ConnectionConfig = {
    ...input,
    id: 'connection-test',
    createdAt: 0,
    updatedAt: 0,
    lastConnectedAt: null
  };
  const client = new UtilityClient('test-connection', deps);
  try {
    await client.start({ role: 'session', connection }, 10000);
    const result = await client.request({ kind: 'ping' }, { timeoutMs: 5000, maxTimeMs: 5000 });
    return { ok: true, version: result.version };
  } catch (error) {
    return { ok: false, error: messageOf(error) };
  } finally {
    client.dispose();
  }
}
