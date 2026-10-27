import type { TransferFormat, TransferSource, TransferProgress } from './transfer';
import type { DatabaseToolName, DatabaseToolsPaths, DatabaseToolsStatus } from './database-tools';
import type {
  DatabaseTransferInput,
  DatabaseTransferOptions,
  DatabaseTransferProgress
} from './database-transfer';
import type { AppSettings, ConnectionConfig, ConnectionInput, SchemaField, TabKind } from './types';

export const IPC = {
  connectionsList: 'connections:list',
  connectionsSave: 'connections:save',
  connectionsDelete: 'connections:delete',
  connectionsTest: 'connections:test',
  sessionsConnect: 'sessions:connect',
  sessionsCollections: 'sessions:collections',
  sessionsDisconnect: 'sessions:disconnect',
  sessionsAdmin: 'sessions:admin',
  tabsCreate: 'tabs:create',
  tabsExecute: 'tabs:execute',
  tabsClose: 'tabs:close',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  databaseToolsBrowse: 'database-tools:browse',
  databaseToolsTest: 'database-tools:test',
  databaseToolsDetect: 'database-tools:detect',
  databaseTransferCreate: 'database-transfers:create',
  databaseTransferChoose: 'database-transfers:choose',
  databaseTransferStart: 'database-transfers:start',
  databaseTransferSnapshot: 'database-transfers:snapshot',
  databaseTransferCancel: 'database-transfers:cancel',
  databaseTransferProgress: 'database-transfers:progress',
  transferChooseFile: 'transfers:choose-file',
  transferStart: 'transfers:start',
  transferCancel: 'transfers:cancel',
  transferSnapshot: 'transfers:snapshot',
  transferProgress: 'transfers:progress',
  menuAction: 'menu:action'
} as const;

export type MenuAction = 'open-preferences' | 'open-connections' | 'new-connection';

export interface InitMessage {
  role: 'session' | 'tab';
  connection: ConnectionConfig;
  database?: string;
  collection?: string;
}
export interface FindResult {
  documents: unknown[];
  truncated: boolean;
}
export interface WriteResult {
  matched: number;
  modified: number;
  deleted: number;
  insertedId: unknown | null;
}

export interface CollectionIndexInfo {
  name: string;
  key: Record<string, unknown>;
  unique?: boolean;
  sparse?: boolean;
  hidden?: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: Record<string, unknown>;
  sizeBytes?: number;
  usageCount?: number;
  usageSince?: string;
}

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
  explainFind: { plan: unknown };
  explainAggregate: { plan: unknown };
  inferSchema: { fields: SchemaField[] };
  dropCollection: { ok: true };
  renameCollection: { ok: true };
  duplicateCollection: { ok: true };
  clearCollection: { deleted: number };
  createCollection: { ok: true };
  dropDatabase: { ok: true };
  listIndexes: { indexes: CollectionIndexInfo[] };
  createIndex: { ok: true; name: string };
  dropIndex: { ok: true };
  hideIndex: { ok: true };
}

export type AdminUtilityRequest =
  | { kind: 'dropCollection'; database: string; collection: string }
  | { kind: 'renameCollection'; database: string; collection: string; newName: string }
  | { kind: 'duplicateCollection'; database: string; collection: string; newName: string }
  | { kind: 'clearCollection'; database: string; collection: string }
  | { kind: 'createCollection'; database: string; name: string }
  | { kind: 'dropDatabase'; database: string }
  | { kind: 'listIndexes'; database: string; collection: string }
  | {
      kind: 'createIndex';
      database: string;
      collection: string;
      key: Record<string, unknown>;
      options: Record<string, unknown>;
    }
  | { kind: 'dropIndex'; database: string; collection: string; name: string }
  | {
      kind: 'hideIndex';
      database: string;
      collection: string;
      name: string;
      hidden: boolean;
    };

export type UtilityRequest =
  | { kind: 'ping' }
  | { kind: 'listDatabases' }
  | { kind: 'listCollections'; database: string }
  | {
      kind: 'find';
      database: string;
      collection: string;
      filter: unknown;
      projection?: unknown;
      sort?: unknown;
      skip?: number;
      limit: number;
    }
  | { kind: 'insertOne'; database: string; collection: string; document: unknown }
  | { kind: 'insertMany'; database: string; collection: string; documents: unknown[] }
  | {
      kind: 'replaceOne';
      database: string;
      collection: string;
      target: unknown;
      document: unknown;
      upsert?: boolean;
    }
  | { kind: 'deleteOne'; database: string; collection: string; target: unknown }
  | { kind: 'deleteMany'; database: string; collection: string; filter: unknown }
  | {
      kind: 'updateOne';
      database: string;
      collection: string;
      filter: unknown;
      update: unknown;
      upsert: boolean;
    }
  | {
      kind: 'updateMany';
      database: string;
      collection: string;
      filter: unknown;
      update: unknown;
      upsert: boolean;
    }
  | { kind: 'countDocuments'; database: string; collection: string; filter: unknown }
  | { kind: 'aggregate'; database: string; collection: string; pipeline: unknown[]; limit: number }
  | {
      kind: 'explainFind';
      database: string;
      collection: string;
      filter: unknown;
      projection?: unknown;
      sort?: unknown;
      skip?: number;
      limit: number;
    }
  | {
      kind: 'explainAggregate';
      database: string;
      collection: string;
      pipeline: unknown[];
      limit: number;
    }
  | { kind: 'inferSchema'; database: string; collection: string; sampleSize: number }
  | AdminUtilityRequest;

export type MainToUtility =
  | { kind: 'init'; init: InitMessage }
  | { kind: 'request'; id: number; request: UtilityRequest; maxTimeMs: number };

export type UtilityToMain =
  | { kind: 'ready' }
  | { kind: 'response'; id: number; ok: true; result: unknown }
  | { kind: 'response'; id: number; ok: false; error: string }
  | { kind: 'fatal'; error: string };

export interface CreateTabInput {
  connectionId: string;
  database: string;
  collection: string;
  kind?: TabKind;
  source?: TransferSource;
}
export interface CreateTabResult {
  tabId: string;
  fields: SchemaField[];
}
export interface TestConnectionResult {
  ok: boolean;
  version?: string;
  error?: string;
}

export interface MongoExplorerApi {
  browseDatabaseTool(name: DatabaseToolName): Promise<string | null>;
  testDatabaseTools(paths: DatabaseToolsPaths): Promise<DatabaseToolsStatus>;
  detectDatabaseTools(): Promise<DatabaseToolsStatus>;
  createDatabaseTransfer(input: DatabaseTransferInput): Promise<string>;
  chooseDatabaseTransferPath(
    tabId: string,
    inputKind: 'archive' | 'directory',
    gzip: boolean
  ): Promise<string | null>;
  startDatabaseTransfer(tabId: string, options: DatabaseTransferOptions): Promise<void>;
  databaseTransferSnapshot(tabId: string): Promise<DatabaseTransferProgress>;
  cancelDatabaseTransfer(tabId: string): Promise<void>;
  onDatabaseTransferProgress(callback: (progress: DatabaseTransferProgress) => void): () => void;
  listConnections(): Promise<ConnectionConfig[]>;
  saveConnection(input: ConnectionInput): Promise<ConnectionConfig>;
  deleteConnection(id: string): Promise<void>;
  testConnection(input: ConnectionInput): Promise<TestConnectionResult>;
  connectSession(connectionId: string): Promise<{ databases: string[] }>;
  listCollections(connectionId: string, database: string): Promise<{ collections: string[] }>;
  disconnectSession(connectionId: string): Promise<void>;
  adminSession<K extends AdminUtilityRequest['kind']>(
    connectionId: string,
    request: Extract<AdminUtilityRequest, { kind: K }>
  ): Promise<UtilityResponses[K]>;
  createTab(input: CreateTabInput): Promise<CreateTabResult>;
  executeTab<K extends UtilityRequest['kind']>(
    tabId: string,
    request: Extract<UtilityRequest, { kind: K }>
  ): Promise<UtilityResponses[K]>;
  closeTab(tabId: string): Promise<void>;
  chooseTransferFile(tabId: string, format: TransferFormat): Promise<TransferProgress>;
  startTransfer(tabId: string, format: TransferFormat): Promise<TransferProgress>;
  cancelTransfer(tabId: string): Promise<void>;
  transferSnapshot(tabId: string): Promise<TransferProgress>;
  onTransferProgress(callback: (progress: TransferProgress) => void): () => void;
  getSettings(): Promise<AppSettings>;
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  onMenuAction(callback: (action: MenuAction) => void): () => void;
}
