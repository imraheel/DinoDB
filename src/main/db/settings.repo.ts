import type { AppSettings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';
import type { DatabaseHandle } from './database';

interface SettingRow {
  key: string;
  value: string;
}

const THEMES: readonly string[] = ['light', 'dark', 'system'];

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isValidLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1000;
}

function readStored(db: DatabaseHandle): Record<string, unknown> {
  const rows = db.prepare<[], SettingRow>('SELECT key, value FROM settings').all();
  const stored: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      stored[row.key] = JSON.parse(row.value) as unknown;
    } catch {
      stored[row.key] = undefined;
    }
  }
  return stored;
}

export function getSettings(db: DatabaseHandle): AppSettings {
  const stored = readStored(db);
  const theme =
    typeof stored.theme === 'string' && THEMES.includes(stored.theme)
      ? (stored.theme as AppSettings['theme'])
      : DEFAULT_SETTINGS.theme;
  const maxTimeMs = isPositiveInt(stored.maxTimeMs) ? stored.maxTimeMs : DEFAULT_SETTINGS.maxTimeMs;
  const defaultLimit = isValidLimit(stored.defaultLimit) ? stored.defaultLimit : DEFAULT_SETTINGS.defaultLimit;
  return { theme, maxTimeMs, defaultLimit };
}

export function saveSettings(db: DatabaseHandle, patch: Partial<AppSettings>): AppSettings {
  const current = getSettings(db);
  const merged: AppSettings = {
    theme: patch.theme ?? current.theme,
    maxTimeMs: patch.maxTimeMs ?? current.maxTimeMs,
    defaultLimit: patch.defaultLimit ?? current.defaultLimit
  };
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const write = db.transaction((entries: [string, string][]) => {
    for (const [key, value] of entries) upsert.run(key, value);
  });
  write([
    ['theme', JSON.stringify(merged.theme)],
    ['maxTimeMs', JSON.stringify(merged.maxTimeMs)],
    ['defaultLimit', JSON.stringify(merged.defaultLimit)]
  ]);
  return getSettings(db);
}
