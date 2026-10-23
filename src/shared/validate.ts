import { buildMongoUri, isJsonObject } from './mongo-uri';
import type { ConnectionInput } from './types';

export function validateConnection(input: ConnectionInput): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push('Name is required');
  if (!input.host.trim()) errors.push('Host is required');
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    errors.push('Port must be an integer between 1 and 65535');
  }
  if (input.authMechanismProperties.trim() && !isJsonObject(input.authMechanismProperties.trim())) {
    errors.push('authMechanismProperties must be a JSON object');
  }
  if (input.extraOptions.trim() && !isJsonObject(input.extraOptions.trim())) {
    errors.push('extraOptions must be a JSON object');
  }
  if (errors.length === 0) {
    try {
      buildMongoUri(input);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return errors;
}
