import type { AdminUtilityRequest, UtilityResponses } from '../../shared/ipc';
import type { ConnectionConfig } from '../../shared/types';
import { UtilityClient } from './utility-client';
import type { UtilityClientDeps } from './utility-client';

export class SessionManager {
  private readonly sessions = new Map<string, UtilityClient>();

  constructor(
    private readonly deps: UtilityClientDeps,
    private readonly getConnection: (id: string) => ConnectionConfig | null
  ) {}

  async connect(connectionId: string): Promise<{ databases: string[] }> {
    const existing = this.sessions.get(connectionId);
    if (existing) {
      const result = await existing.request({ kind: 'listDatabases' }, { timeoutMs: 10000, maxTimeMs: 10000 });
      return { databases: result.databases };
    }
    const connection = this.getConnection(connectionId);
    if (connection === null) throw new Error(`Connection not found: ${connectionId}`);
    const client = new UtilityClient(`session:${connectionId}`, this.deps);
    try {
      await client.start({ role: 'session', connection }, 20000);
      const result = await client.request({ kind: 'listDatabases' }, { timeoutMs: 10000, maxTimeMs: 10000 });
      this.sessions.set(connectionId, client);
      return { databases: result.databases };
    } catch (error) {
      client.dispose();
      throw error;
    }
  }

  async listCollections(connectionId: string, database: string): Promise<string[]> {
    const client = this.sessions.get(connectionId);
    if (!client) throw new Error('Session is not connected');
    const result = await client.request(
      { kind: 'listCollections', database },
      { timeoutMs: 10000, maxTimeMs: 10000 }
    );
    return result.collections;
  }

  async admin<K extends AdminUtilityRequest['kind']>(
    connectionId: string,
    request: Extract<AdminUtilityRequest, { kind: K }>
  ): Promise<UtilityResponses[K]> {
    const client = this.sessions.get(connectionId);
    if (!client) throw new Error('Session is not connected');
    return client.request(request, { timeoutMs: 60000, maxTimeMs: 60000 });
  }

  disconnect(connectionId: string): void {
    const client = this.sessions.get(connectionId);
    if (!client) return;
    client.dispose();
    this.sessions.delete(connectionId);
  }

  disposeAll(): void {
    for (const [, client] of this.sessions) client.dispose();
    this.sessions.clear();
  }
}
