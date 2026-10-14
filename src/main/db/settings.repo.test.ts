import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { DEFAULT_SETTINGS } from '../../shared/types';
import { runMigrations } from './database';
import type { DatabaseHandle } from './database';
import { getSettings, saveSettings } from './settings.repo';

function makeDb(): DatabaseHandle {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function seed(db: DatabaseHandle, key: string, raw: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, raw);
}

describe('settings.repo', () => {
  it('returns defaults when the table is empty', () => {
    const db = makeDb();
    expect(getSettings(db)).toEqual(DEFAULT_SETTINGS);
  });

  it('roundtrips a partial save and preserves earlier values', () => {
    const db = makeDb();
    const first = saveSettings(db, { theme: 'dark' });
    expect(first).toEqual({ theme: 'dark', maxTimeMs: 30000, defaultLimit: 50, vibrancy: true });
    const second = saveSettings(db, { defaultLimit: 200 });
    expect(second).toEqual({ theme: 'dark', maxTimeMs: 30000, defaultLimit: 200, vibrancy: true });
    expect(getSettings(db)).toEqual(second);
  });

  it('roundtrips a full save', () => {
    const db = makeDb();
    const saved = saveSettings(db, {
      theme: 'light',
      maxTimeMs: 5000,
      defaultLimit: 100,
      vibrancy: false
    });
    expect(saved).toEqual({ theme: 'light', maxTimeMs: 5000, defaultLimit: 100, vibrancy: false });
    expect(getSettings(db)).toEqual(saved);
  });

  it('falls back to defaults for invalid stored values', () => {
    const db = makeDb();
    seed(db, 'theme', JSON.stringify('neon'));
    seed(db, 'maxTimeMs', JSON.stringify(-1));
    seed(db, 'defaultLimit', JSON.stringify(1001));
    expect(getSettings(db)).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults for malformed JSON and wrong types', () => {
    const db = makeDb();
    seed(db, 'theme', '{not json');
    seed(db, 'maxTimeMs', JSON.stringify('30000'));
    seed(db, 'defaultLimit', JSON.stringify(1000.5));
    expect(getSettings(db)).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back per field without discarding valid siblings', () => {
    const db = makeDb();
    seed(db, 'theme', JSON.stringify('dark'));
    seed(db, 'maxTimeMs', JSON.stringify(0));
    seed(db, 'defaultLimit', JSON.stringify(25));
    seed(db, 'vibrancy', JSON.stringify(false));
    expect(getSettings(db)).toEqual({
      theme: 'dark',
      maxTimeMs: 30000,
      defaultLimit: 25,
      vibrancy: false
    });
  });

  it('falls back vibrancy to default for non-boolean stored values', () => {
    const db = makeDb();
    seed(db, 'vibrancy', JSON.stringify('yes'));
    expect(getSettings(db).vibrancy).toBe(true);
  });

  it('overwrites an existing key on save', () => {
    const db = makeDb();
    saveSettings(db, { maxTimeMs: 10000 });
    saveSettings(db, { maxTimeMs: 15000 });
    expect(getSettings(db).maxTimeMs).toBe(15000);
    const row = db.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM settings').get();
    expect(row?.count).toBe(4);
  });
});
