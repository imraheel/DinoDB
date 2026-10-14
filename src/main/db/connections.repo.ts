import { randomUUID } from 'node:crypto';
import type { AuthMechanism, ConnectionConfig, ConnectionInput } from '../../shared/types';
import type { DatabaseHandle } from './database';

interface ConnectionRow {
  id: string;
  name: string;
  host: string;
  port: number;
  default_database: string;
  username: string;
  password: string;
  auth_mechanism: string;
  auth_source: string;
  auth_mechanism_properties: string;
  extra_options: string;
  created_at: number;
  updated_at: number;
  last_connected_at: number | null;
}

function toConnection(row: ConnectionRow): ConnectionConfig {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    defaultDatabase: row.default_database,
    username: row.username,
    password: row.password,
    authMechanism: row.auth_mechanism as AuthMechanism,
    authSource: row.auth_source,
    authMechanismProperties: row.auth_mechanism_properties,
    extraOptions: row.extra_options,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastConnectedAt: row.last_connected_at
  };
}

export function listConnections(db: DatabaseHandle): ConnectionConfig[] {
  const rows = db.prepare<[], ConnectionRow>('SELECT * FROM connections ORDER BY name COLLATE NOCASE').all();
  return rows.map(toConnection);
}

export function getConnection(db: DatabaseHandle, id: string): ConnectionConfig | null {
  const row = db.prepare<[string], ConnectionRow>('SELECT * FROM connections WHERE id = ?').get(id);
  return row === undefined ? null : toConnection(row);
}

export function saveConnection(db: DatabaseHandle, input: ConnectionInput): ConnectionConfig {
  const now = Date.now();
  let id = input.id;
  if (id === undefined || id === '') {
    id = randomUUID();
    db.prepare(
      'INSERT INTO connections (id, name, host, port, default_database, username, password, auth_mechanism, auth_source, auth_mechanism_properties, extra_options, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      input.name,
      input.host,
      input.port,
      input.defaultDatabase,
      input.username,
      input.password,
      input.authMechanism,
      input.authSource,
      input.authMechanismProperties,
      input.extraOptions,
      now,
      now
    );
  } else {
    const result = db.prepare(
      'UPDATE connections SET name = ?, host = ?, port = ?, default_database = ?, username = ?, password = ?, auth_mechanism = ?, auth_source = ?, auth_mechanism_properties = ?, extra_options = ?, updated_at = ? WHERE id = ?'
    ).run(
      input.name,
      input.host,
      input.port,
      input.defaultDatabase,
      input.username,
      input.password,
      input.authMechanism,
      input.authSource,
      input.authMechanismProperties,
      input.extraOptions,
      now,
      id
    );
    if (result.changes === 0) throw new Error(`Connection not found: ${id}`);
  }
  const saved = getConnection(db, id);
  if (saved === null) throw new Error(`Connection not found: ${id}`);
  return saved;
}

export function deleteConnection(db: DatabaseHandle, id: string): void {
  db.prepare('DELETE FROM connections WHERE id = ?').run(id);
}

export function touchLastConnected(db: DatabaseHandle, id: string): void {
  db.prepare('UPDATE connections SET last_connected_at = ? WHERE id = ?').run(Date.now(), id);
}
