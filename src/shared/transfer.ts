import type { ConnectionConfig } from './types';

export type TransferFormat = 'json' | 'csv' | 'bson';
export type TransferDirection = 'import' | 'export';
export type TransferSource =
  | { kind: 'collection' }
  | { kind: 'selected'; documents: unknown[] }
  | {
      kind: 'find';
      filter: unknown;
      projection?: unknown;
      sort?: unknown;
      skip?: number;
      limit?: number;
    }
  | { kind: 'aggregate'; pipeline: unknown[] };

export interface TransferInput {
  connectionId: string;
  database: string;
  collection: string;
  direction: TransferDirection;
  source?: TransferSource;
}
export type TransferStatus =
  | 'configuring'
  | 'starting'
  | 'running'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled';
export interface TransferProgress {
  tabId: string;
  status: TransferStatus;
  phase: string;
  documents: number;
  bytes: number;
  totalBytes?: number;
  totalDocuments?: number;
  elapsedMs: number;
  filePath?: string;
  format?: TransferFormat;
  error?: string;
  uncertainBatch?: boolean;
}
export interface TransferJob extends TransferInput {
  tabId: string;
  runId?: string;
  format: TransferFormat;
  filePath: string;
  connection: ConnectionConfig;
}
export type TransferToWorker = { kind: 'start'; job: TransferJob } | { kind: 'cancel' };
export type TransferFromWorker = { kind: 'progress'; progress: TransferProgress };

export function transferActive(status: TransferStatus): boolean {
  return status === 'starting' || status === 'running' || status === 'cancelling';
}

export function assertReadOnlyPipeline(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertReadOnlyPipeline(item);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === '$out' || key === '$merge')
        throw new Error('Export cannot run a pipeline containing $out or $merge.');
      assertReadOnlyPipeline(item);
    }
  }
}

export function transferTempPaths(job: {
  filePath: string;
  tabId: string;
  runId?: string;
}): string[] {
  const suffix = job.runId ?? job.tabId;
  return [`${job.filePath}.nexdb-${suffix}.partial`, `${job.filePath}.nexdb-${suffix}.spool`];
}
