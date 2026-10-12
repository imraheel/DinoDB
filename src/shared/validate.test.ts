import { describe, expect, it } from 'vitest';
import { validateConnection } from './validate';
import type { ConnectionInput } from './types';

const valid: ConnectionInput = {
  name: 'Local',
  host: 'localhost',
  port: 27017,
  defaultDatabase: '',
  username: '',
  password: '',
  authMechanism: '',
  authSource: '',
  authMechanismProperties: '',
  extraOptions: ''
};

describe('validateConnection', () => {
  it('returns no errors for a valid connection', () => {
    expect(validateConnection(valid)).toEqual([]);
  });

  it('requires name and host', () => {
    expect(validateConnection({ ...valid, name: '  ', host: '' })).toEqual(['Name is required', 'Host is required']);
  });

  it('rejects invalid ports', () => {
    expect(validateConnection({ ...valid, port: 0 })).toContain('Port must be an integer between 1 and 65535');
    expect(validateConnection({ ...valid, port: 70000 })).toContain('Port must be an integer between 1 and 65535');
    expect(validateConnection({ ...valid, port: 27.5 })).toContain('Port must be an integer between 1 and 65535');
  });

  it('reports invalid JSON fields', () => {
    expect(validateConnection({ ...valid, authMechanismProperties: 'nope' })).toContain(
      'authMechanismProperties must be a JSON object'
    );
    expect(validateConnection({ ...valid, extraOptions: 'nope' })).toContain('extraOptions must be a JSON object');
  });
});
