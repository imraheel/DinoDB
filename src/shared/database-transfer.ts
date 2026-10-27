import type { ConnectionConfig } from './types';
export type DatabaseTransferKind = 'database-backup' | 'database-restore';
export type DatabaseRestoreMode = 'new-database' | 'insert' | 'replace-collections';
export interface DatabaseTransferInput {
  kind: DatabaseTransferKind;
  connectionId: string;
  database: string;
}
export type DatabaseTransferOptions =
  | { kind: 'database-backup'; gzip: boolean }
  | {
      kind: 'database-restore';
      inputKind: 'archive' | 'directory';
      gzip: boolean;
      sourceDatabase: string;
      targetDatabase: string;
      mode: DatabaseRestoreMode;
    };
export interface DatabaseTransferProgress {
  tabId: string;
  state:
    | 'configuring'
    | 'checking'
    | 'running'
    | 'cancelling'
    | 'completed'
    | 'failed'
    | 'cancelled';
  phase: string;
  elapsedMs: number;
  activeCollections: string[];
  completedCollections: number;
  documents?: number;
  bytes?: number;
  logTail: string[];
  exitCode?: number;
  error?: string;
  mayHavePartialChanges: boolean;
  filePath?: string;
}
export interface DatabaseTransferJob {
  tabId: string;
  runId: string;
  connection: ConnectionConfig;
  input: DatabaseTransferInput;
  options: DatabaseTransferOptions;
  filePath: string;
  executable: string;
  workDir: string;
}
export type DatabaseToWorker = { kind: 'start'; job: DatabaseTransferJob } | { kind: 'cancel' };
export type DatabaseFromWorker =
  | { kind: 'progress'; progress: DatabaseTransferProgress }
  | { kind: 'child'; pid: number | null };
export function databaseTransferActive(state: DatabaseTransferProgress['state']): boolean {
  return state === 'checking' || state === 'running' || state === 'cancelling';
}
export function validateDatabase(name: unknown, allowSystem = false): asserts name is string {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    new TextEncoder().encode(name).length >= 64 ||
    /[\s\0/\\. "$*<>:|?]/.test(name) ||
    (!allowSystem && ['admin', 'local', 'config'].includes(name))
  ) {
    throw new Error(
      'Use an application database name under 64 bytes without spaces, dots, wildcards or reserved characters.'
    );
  }
}
export function validateDatabaseOptions(
  input: DatabaseTransferInput,
  options: DatabaseTransferOptions
): void {
  validateDatabase(input.database, input.kind === 'database-restore');
  if (!options || options.kind !== input.kind || typeof options.gzip !== 'boolean')
    throw new Error('Invalid database operation options.');
  if (options.kind === 'database-restore') {
    validateDatabase(options.sourceDatabase);
    validateDatabase(options.targetDatabase);
    if (
      !['archive', 'directory'].includes(options.inputKind) ||
      !['new-database', 'insert', 'replace-collections'].includes(options.mode)
    ) {
      throw new Error('Invalid restore options.');
    }
  }
}
