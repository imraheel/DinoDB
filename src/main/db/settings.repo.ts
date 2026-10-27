import type {
  AccentSetting,
  AppSettings,
  CodeFontSetting,
  ThemeSetting,
  UiFontSetting
} from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';
import { normalizeToolPath } from '../../shared/database-tools';
import type { DatabaseHandle } from './database';

interface SettingRow {
  key: string;
  value: string;
}

const THEMES: readonly string[] = ['light', 'dark', 'system'];
const ACCENTS: readonly string[] = [
  'blue',
  'purple',
  'pink',
  'red',
  'orange',
  'yellow',
  'green',
  'graphite'
];
const UI_FONTS: readonly string[] = ['system', 'serif', 'mono'];
const CODE_FONTS: readonly string[] = ['system-mono', 'menlo', 'consolas', 'courier'];

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isValidLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1000;
}

function isInRangeInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function oneOf<T extends string>(value: unknown, allowed: readonly string[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value) ? (value as T) : fallback;
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
  const theme = oneOf<ThemeSetting>(stored.theme, THEMES, DEFAULT_SETTINGS.theme);
  const accent = oneOf<AccentSetting>(stored.accent, ACCENTS, DEFAULT_SETTINGS.accent);
  const uiFont = oneOf<UiFontSetting>(stored.uiFont, UI_FONTS, DEFAULT_SETTINGS.uiFont);
  const codeFont = oneOf<CodeFontSetting>(stored.codeFont, CODE_FONTS, DEFAULT_SETTINGS.codeFont);
  const uiFontSize = isInRangeInt(stored.uiFontSize, 12, 15)
    ? stored.uiFontSize
    : DEFAULT_SETTINGS.uiFontSize;
  const tableFontSize = isInRangeInt(stored.tableFontSize, 10, 14)
    ? stored.tableFontSize
    : DEFAULT_SETTINGS.tableFontSize;
  const editorFontSize = isInRangeInt(stored.editorFontSize, 11, 18)
    ? stored.editorFontSize
    : DEFAULT_SETTINGS.editorFontSize;
  const maxTimeMs = isPositiveInt(stored.maxTimeMs) ? stored.maxTimeMs : DEFAULT_SETTINGS.maxTimeMs;
  const defaultLimit = isValidLimit(stored.defaultLimit)
    ? stored.defaultLimit
    : DEFAULT_SETTINGS.defaultLimit;
  return {
    theme,
    accent,
    uiFont,
    codeFont,
    uiFontSize,
    tableFontSize,
    editorFontSize,
    maxTimeMs,
    defaultLimit,
    mongodumpPath: typeof stored.mongodumpPath === 'string' ? stored.mongodumpPath : '',
    mongorestorePath: typeof stored.mongorestorePath === 'string' ? stored.mongorestorePath : ''
  };
}

export function saveSettings(db: DatabaseHandle, patch: Partial<AppSettings>): AppSettings {
  const current = getSettings(db);
  const merged: AppSettings = {
    theme: patch.theme ?? current.theme,
    accent: patch.accent ?? current.accent,
    uiFont: patch.uiFont ?? current.uiFont,
    codeFont: patch.codeFont ?? current.codeFont,
    uiFontSize: patch.uiFontSize ?? current.uiFontSize,
    tableFontSize: patch.tableFontSize ?? current.tableFontSize,
    editorFontSize: patch.editorFontSize ?? current.editorFontSize,
    maxTimeMs: patch.maxTimeMs ?? current.maxTimeMs,
    defaultLimit: patch.defaultLimit ?? current.defaultLimit,
    mongodumpPath: normalizeToolPath(patch.mongodumpPath ?? current.mongodumpPath),
    mongorestorePath: normalizeToolPath(patch.mongorestorePath ?? current.mongorestorePath)
  };
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const write = db.transaction((entries: [string, string][]) => {
    for (const [key, value] of entries) upsert.run(key, value);
  });
  write([
    ['theme', JSON.stringify(merged.theme)],
    ['accent', JSON.stringify(merged.accent)],
    ['uiFont', JSON.stringify(merged.uiFont)],
    ['codeFont', JSON.stringify(merged.codeFont)],
    ['uiFontSize', JSON.stringify(merged.uiFontSize)],
    ['tableFontSize', JSON.stringify(merged.tableFontSize)],
    ['editorFontSize', JSON.stringify(merged.editorFontSize)],
    ['maxTimeMs', JSON.stringify(merged.maxTimeMs)],
    ['defaultLimit', JSON.stringify(merged.defaultLimit)],
    ['mongodumpPath', JSON.stringify(merged.mongodumpPath)],
    ['mongorestorePath', JSON.stringify(merged.mongorestorePath)]
  ]);
  return getSettings(db);
}
