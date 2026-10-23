import type { ConnectionConfig } from './types';

export type UriSource = Pick<
  ConnectionConfig,
  | 'host'
  | 'port'
  | 'defaultDatabase'
  | 'username'
  | 'password'
  | 'authMechanism'
  | 'authSource'
  | 'authMechanismProperties'
  | 'extraOptions'
>;

export function isJsonObject(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}

export function buildMongoUri(cfg: UriSource): string {
  const auth = cfg.username
    ? `${encodeURIComponent(cfg.username)}${cfg.password ? `:${encodeURIComponent(cfg.password)}` : ''}@`
    : '';
  const params: string[] = [];

  if (cfg.username) {
    if (cfg.authSource) params.push(`authSource=${encodeURIComponent(cfg.authSource)}`);
    if (cfg.authMechanism && cfg.authMechanism !== 'DEFAULT')
      params.push(`authMechanism=${cfg.authMechanism}`);
    const props = cfg.authMechanismProperties.trim();
    if (props) {
      if (!isJsonObject(props)) throw new Error('authMechanismProperties must be a JSON object');
      const pairs = Object.entries(JSON.parse(props) as Record<string, unknown>).map(
        ([k, v]) => `${k}:${String(v)}`
      );
      params.push(`authMechanismProperties=${encodeURIComponent(pairs.join(','))}`);
    }
  }

  const extra = cfg.extraOptions.trim();
  if (extra) {
    if (!isJsonObject(extra)) throw new Error('extraOptions must be a JSON object');
    for (const [k, v] of Object.entries(JSON.parse(extra) as Record<string, unknown>)) {
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(k)) throw new Error(`Invalid extra option name: ${k}`);
      params.push(`${k}=${encodeURIComponent(String(v))}`);
    }
  }

  const path = cfg.defaultDatabase ? `/${cfg.defaultDatabase}` : '/';
  const query = params.length ? `?${params.join('&')}` : '';
  return `mongodb://${auth}${cfg.host}:${cfg.port}${path}${query}`;
}
