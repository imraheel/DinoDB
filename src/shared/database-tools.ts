export type DatabaseToolName = 'mongodump' | 'mongorestore' | 'mongosh';
export interface DatabaseToolsPaths {
  mongodumpPath: string;
  mongorestorePath: string;
  mongoshPath: string;
}
export interface DatabaseToolStatus {
  name: DatabaseToolName;
  source: 'custom' | 'bundled' | 'installed' | 'missing';
  path: string | null;
  version: string | null;
  available: boolean;
  error?: string;
}
export type DatabaseToolsStatus = Record<DatabaseToolName, DatabaseToolStatus>;
export function toolName(value: unknown): DatabaseToolName {
  if (value !== 'mongodump' && value !== 'mongorestore' && value !== 'mongosh')
    throw new Error('Unknown MongoDB tool.');
  return value;
}
export function normalizeToolPath(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Tool path must be a string.');
  const text = value.trim();
  if (text.length > 4096 || text.includes('\0')) throw new Error('Invalid tool path.');
  if (text && !text.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(text) && !text.startsWith('\\\\')) {
    throw new Error('Choose an absolute executable path.');
  }
  return text;
}
