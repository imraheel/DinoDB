import { randomUUID } from 'node:crypto';
import type { ConnectionConfig } from '../../shared/types';
import type { CreateTabInput, CreateTabResult, UtilityRequest, UtilityResponses } from '../../shared/ipc';
import { UtilityClient } from './utility-client';
import type { UtilityClientDeps } from './utility-client';

interface TabRecord {
  client: UtilityClient;
  connectionId: string;
  database: string;
  collection: string;
}

export class TabManager {
  private readonly tabs = new Map<string, TabRecord>();

  constructor(private readonly deps: UtilityClientDeps) {}

  async create(
    input: CreateTabInput,
    connection: ConnectionConfig,
    sampleSize: number
  ): Promise<CreateTabResult> {
    const tabId = randomUUID();
    const client = new UtilityClient(`tab:${tabId}`, this.deps);
    try {
      await client.start(
        { role: 'tab', connection, database: input.database, collection: input.collection },
        20000
      );
      if (input.kind === 'indexes') {
        this.tabs.set(tabId, {
          client,
          connectionId: input.connectionId,
          database: input.database,
          collection: input.collection
        });
        return { tabId, fields: [] };
      }
      const result = await client.request(
        { kind: 'inferSchema', database: input.database, collection: input.collection, sampleSize },
        { timeoutMs: 15000, maxTimeMs: 15000 }
      );
      this.tabs.set(tabId, {
        client,
        connectionId: input.connectionId,
        database: input.database,
        collection: input.collection
      });
      return { tabId, fields: result.fields };
    } catch (error) {
      client.dispose();
      throw error;
    }
  }

  async execute<K extends UtilityRequest['kind']>(
    tabId: string,
    request: Extract<UtilityRequest, { kind: K }>,
    maxTimeMs: number
  ): Promise<UtilityResponses[K]> {
    const record = this.tabs.get(tabId);
    if (!record) throw new Error(`Tab is closed: ${tabId}`);
    return record.client.request(request, { timeoutMs: maxTimeMs + 5000, maxTimeMs });
  }

  close(tabId: string): void {
    const record = this.tabs.get(tabId);
    if (!record) return;
    record.client.dispose();
    this.tabs.delete(tabId);
  }

  closeForConnection(connectionId: string): void {
    for (const [tabId, record] of this.tabs) {
      if (record.connectionId === connectionId) {
        record.client.dispose();
        this.tabs.delete(tabId);
      }
    }
  }

  disposeAll(): void {
    for (const [, record] of this.tabs) record.client.dispose();
    this.tabs.clear();
  }
}
