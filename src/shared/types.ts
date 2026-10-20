export type AuthMechanism = '' | 'DEFAULT' | 'MONGODB-X509' | 'MONGODB-AWS' | 'GSSAPI' | 'PLAIN';

export interface ConnectionInput {
  id?: string;
  name: string;
  host: string;
  port: number;
  defaultDatabase: string;
  username: string;
  password: string;
  authMechanism: AuthMechanism;
  authSource: string;
  authMechanismProperties: string;
  extraOptions: string;
}

export interface ConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  defaultDatabase: string;
  username: string;
  password: string;
  authMechanism: AuthMechanism;
  authSource: string;
  authMechanismProperties: string;
  extraOptions: string;
  createdAt: number;
  updatedAt: number;
  lastConnectedAt: number | null;
}

export type ThemeSetting = 'light' | 'dark' | 'system';
export type AccentSetting =
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'graphite';
export type UiFontSetting = 'system' | 'serif' | 'mono';
export type CodeFontSetting = 'system-mono' | 'menlo' | 'consolas' | 'courier';

export interface AppSettings {
  theme: ThemeSetting;
  accent: AccentSetting;
  uiFont: UiFontSetting;
  codeFont: CodeFontSetting;
  uiFontSize: number;
  tableFontSize: number;
  editorFontSize: number;
  maxTimeMs: number;
  defaultLimit: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  accent: 'blue',
  uiFont: 'system',
  codeFont: 'system-mono',
  uiFontSize: 13,
  tableFontSize: 12,
  editorFontSize: 13,
  maxTimeMs: 30000,
  defaultLimit: 50
};
export const SCHEMA_SAMPLE_SIZE = 50;

export interface SchemaField { path: string; type: string }

export interface QueryInput { text: string; skip: string; limit: string }
