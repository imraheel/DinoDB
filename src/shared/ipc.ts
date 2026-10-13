import type { AppSettings, ConnectionConfig, ConnectionInput, SchemaField } from './types';

export const IPC = {
  connectionsList: 'connections:list',
  connectionsSave: 'connections:save',
  connectionsDelete: 'connections:delete',
  connectionsTest: 'connections:test',
  sessionsConnect: 'sessions:connect',
  sessionsCollections: 'sessions:collections',
  sessionsDisconnect: 'sessions:disconnect',
  tabsCreate: 'tabs:create',
  tabsExecute: 'tabs:execute',
  tabsClose: 'tabs:close',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  menuAction: 'menu:action'
} as const;

export type MenuAction = 'open-preferences' | 'open-connections' | 'new-connection';

export interface InitMessage { role: 'session' | 'tab'; connection: ConnectionConfig; database?: string; collection?: string }
export interface FindResult { documents: unknown[]; truncated: boolean }
export interface WriteResult { matched: number; modified: number; deleted: number; insertedId: unknown | null }

export interface UtilityResponses {
  ping: { version: string };
  listDatabases: { databases: string[] };
  listCollections: { collections: string[] };
  find: FindResult;
  insertOne: WriteResult;
  insertMany: WriteResult;
  replaceOne: WriteResult;
  deleteOne: WriteResult;
  deleteMany: WriteResult;
  updateOne: WriteResult;
  updateMany: WriteResult;
  countDocuments: { count: number };
  aggregate: FindResult;
  inferSchema: { fields: SchemaField[] };
}

export type UtilityRequest =
  | { kind: 'ping' }
  | { kind: 'listDatabases' }
  | { kind: 'listCollections'; database: string }
  | { kind: 'find'; database: string; collection: string; filter: unknown; projection?: unknown; sort?: unknown; skip?: number; limit: number }
  | { kind: 'insertOne'; database: string; collection: string; document: unknown }
  | { kind: 'insertMany'; database: string; collection: string; documents: unknown[] }
  | { kind: 'replaceOne'; database: string; collection: string; target: unknown; document: unknown; upsert?: boolean }
  | { kind: 'deleteOne'; database: string; collection: string; target: unknown }
  | { kind: 'deleteMany'; database: string; collection: string; filter: unknown }
  | { kind: 'updateOne'; database: string; collection: string; filter: unknown; update: unknown; upsert: boolean }
  | { kind: 'updateMany'; database: string; collection: string; filter: unknown; update: unknown; upsert: boolean }
  | { kind: 'countDocuments'; database: string; collection: string; filter: unknown }
  | { kind: 'aggregate'; database: string; collection: string; pipeline: unknown[]; limit: number }
  | { kind: 'inferSchema'; database: string; collection: string; sampleSize: number };

export type MainToUtility =
  | { kind: 'init'; init: InitMessage }
  | { kind: 'request'; id: number; request: UtilityRequest; maxTimeMs: number };

export type UtilityToMain =
  | { kind: 'ready' }
  | { kind: 'response'; id: number; ok: true; result: unknown }
  | { kind: 'response'; id: number; ok: false; error: string }
  | { kind: 'fatal'; error: string };

export interface CreateTabInput { connectionId: string; database: string; collection: string }
export interface CreateTabResult { tabId: string; fields: SchemaField[] }
export interface TestConnectionResult { ok: boolean; version?: string; error?: string }

export interface MongoExplorerApi {
  listConnections(): Promise<ConnectionConfig[]>;
  saveConnection(input: ConnectionInput): Promise<ConnectionConfig>;
  deleteConnection(id: string): Promise<void>;
  testConnection(input: ConnectionInput): Promise<TestConnectionResult>;
  connectSession(connectionId: string): Promise<{ databases: string[] }>;
  listCollections(connectionId: string, database: string): Promise<{ collections: string[] }>;
  disconnectSession(connectionId: string): Promise<void>;
  createTab(input: CreateTabInput): Promise<CreateTabResult>;
  executeTab<K extends UtilityRequest['kind']>(
    tabId: string,
    request: Extract<UtilityRequest, { kind: K }>
  ): Promise<UtilityResponses[K]>;
  closeTab(tabId: string): Promise<void>;
  getSettings(): Promise<AppSettings>;
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  onMenuAction(callback: (action: MenuAction) => void): () => void;
}
