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

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  maxTimeMs: number;
  defaultLimit: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  maxTimeMs: 30000,
  defaultLimit: 50
};
export const SCHEMA_SAMPLE_SIZE = 50;

export interface SchemaField { path: string; type: string }

export interface QueryInput { text: string; skip: string; limit: string }
