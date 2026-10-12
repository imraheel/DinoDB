import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { ConnectionInput } from '../../shared/types';
import { deleteConnection, getConnection, listConnections, saveConnection } from './connections.repo';
import { runMigrations } from './database';
import type { DatabaseHandle } from './database';

function makeDb(): DatabaseHandle {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function baseInput(): ConnectionInput {
  return {
    name: 'Local',
    host: '127.0.0.1',
    port: 27017,
    defaultDatabase: 'test',
    username: 'admin',
    password: 'secret',
    authMechanism: '',
    authSource: 'admin',
    authMechanismProperties: '',
    extraOptions: ''
  };
}

describe('connections.repo', () => {
  it('inserts a connection and reads it back', () => {
    const db = makeDb();
    const input = baseInput();
    const saved = saveConnection(db, input);
    expect(saved.id).toBeTruthy();
    expect(saved).toEqual({
      ...input,
      id: saved.id,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number)
    });
    expect(getConnection(db, saved.id)).toEqual(saved);
  });

  it('keeps empty authMechanism as empty string', () => {
    const db = makeDb();
    const saved = saveConnection(db, baseInput());
    expect(saved.authMechanism).toBe('');
    const updated = saveConnection(db, { ...saved, authMechanism: 'PLAIN' });
    expect(updated.authMechanism).toBe('PLAIN');
    const restored = saveConnection(db, { ...updated, authMechanism: '' });
    expect(restored.authMechanism).toBe('');
  });

  it('updates an existing connection and returns a fresh read', () => {
    const db = makeDb();
    const saved = saveConnection(db, baseInput());
    const updated = saveConnection(db, { ...saved, name: 'Prod', port: 27018 });
    expect(updated.id).toBe(saved.id);
    expect(updated.name).toBe('Prod');
    expect(updated.port).toBe(27018);
    expect(updated.createdAt).toBe(saved.createdAt);
    expect(getConnection(db, saved.id)?.name).toBe('Prod');
    expect(listConnections(db)).toHaveLength(1);
  });

  it('throws when updating a missing id', () => {
    const db = makeDb();
    expect(() => saveConnection(db, { ...baseInput(), id: 'missing-id' })).toThrow(/Connection not found/);
  });

  it('lists connections ordered by name case-insensitively', () => {
    const db = makeDb();
    saveConnection(db, { ...baseInput(), name: 'charlie' });
    saveConnection(db, { ...baseInput(), name: 'Alpha' });
    saveConnection(db, { ...baseInput(), name: 'bravo' });
    const names = listConnections(db).map((connection) => connection.name);
    expect(names).toEqual(['Alpha', 'bravo', 'charlie']);
  });

  it('deletes a connection', () => {
    const db = makeDb();
    const saved = saveConnection(db, baseInput());
    deleteConnection(db, saved.id);
    expect(getConnection(db, saved.id)).toBeNull();
    expect(listConnections(db)).toEqual([]);
    deleteConnection(db, saved.id);
  });

  it('returns null for an unknown connection', () => {
    const db = makeDb();
    expect(getConnection(db, 'nope')).toBeNull();
  });
});
