import Database from 'better-sqlite3';

export type DatabaseHandle = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  default_database TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL DEFAULT '',
  auth_mechanism TEXT NOT NULL DEFAULT '',
  auth_source TEXT NOT NULL DEFAULT '',
  auth_mechanism_properties TEXT NOT NULL DEFAULT '',
  extra_options TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export function runMigrations(db: DatabaseHandle): void {
  db.exec(SCHEMA);
}

let singleton: DatabaseHandle | null = null;

export function getDb(file: string): DatabaseHandle {
  if (singleton !== null) return singleton;
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  singleton = db;
  return db;
}

export function closeDb(): void {
  if (singleton !== null) {
    singleton.close();
    singleton = null;
  }
}
