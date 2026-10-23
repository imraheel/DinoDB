import { describe, expect, it } from 'vitest';
import { buildMongoUri, isJsonObject } from './mongo-uri';
import type { UriSource } from './mongo-uri';

const base: UriSource = {
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

describe('isJsonObject', () => {
  it('returns true for plain objects', () => {
    expect(isJsonObject('{"a":1}')).toBe(true);
    expect(isJsonObject('{}')).toBe(true);
  });

  it('returns false for arrays, primitives, and invalid JSON', () => {
    expect(isJsonObject('[1,2]')).toBe(false);
    expect(isJsonObject('1')).toBe(false);
    expect(isJsonObject('null')).toBe(false);
    expect(isJsonObject('true')).toBe(false);
    expect(isJsonObject('"str"')).toBe(false);
    expect(isJsonObject('{oops')).toBe(false);
  });
});

describe('buildMongoUri', () => {
  it('builds a plain local URI', () => {
    expect(buildMongoUri(base)).toBe('mongodb://localhost:27017/');
  });

  it('includes the default database path', () => {
    expect(buildMongoUri({ ...base, defaultDatabase: 'mydb' })).toBe(
      'mongodb://localhost:27017/mydb'
    );
  });

  it('encodes credentials and includes authSource', () => {
    const uri = buildMongoUri({
      ...base,
      username: 'p@ss/w:rd',
      password: 's3cr:t',
      authSource: 'admin'
    });
    expect(uri).toBe('mongodb://p%40ss%2Fw%3Ard:s3cr%3At@localhost:27017/?authSource=admin');
  });

  it('adds authMechanism only when non-default', () => {
    const withDefault = buildMongoUri({
      ...base,
      username: 'u',
      authMechanism: 'DEFAULT',
      authSource: 'admin'
    });
    expect(withDefault).toBe('mongodb://u@localhost:27017/?authSource=admin');

    const x509 = buildMongoUri({
      ...base,
      username: 'u',
      authMechanism: 'MONGODB-X509',
      authSource: '$external'
    });
    expect(x509).toBe(
      'mongodb://u@localhost:27017/?authSource=%24external&authMechanism=MONGODB-X509'
    );
  });

  it('encodes authMechanismProperties JSON pairs', () => {
    const uri = buildMongoUri({
      ...base,
      username: 'u',
      authMechanism: 'GSSAPI',
      authMechanismProperties: '{"SERVICE_NAME":"mongodb"}'
    });
    expect(uri).toContain('authMechanismProperties=SERVICE_NAME%3Amongodb');
  });

  it('merges extraOptions as encoded query params', () => {
    const uri = buildMongoUri({ ...base, extraOptions: '{"replicaSet":"rs0","ssl":true}' });
    expect(uri).toBe('mongodb://localhost:27017/?replicaSet=rs0&ssl=true');
  });

  it('throws on non-JSON or array extraOptions', () => {
    expect(() => buildMongoUri({ ...base, extraOptions: 'not-json' })).toThrow(
      'extraOptions must be a JSON object'
    );
    expect(() => buildMongoUri({ ...base, extraOptions: '[1]' })).toThrow(
      'extraOptions must be a JSON object'
    );
  });

  it('throws on invalid extra option names', () => {
    expect(() => buildMongoUri({ ...base, extraOptions: '{"bad-name":"x"}' })).toThrow(
      'Invalid extra option name: bad-name'
    );
  });

  it('throws on non-JSON authMechanismProperties', () => {
    expect(() =>
      buildMongoUri({ ...base, username: 'u', authMechanismProperties: 'oops' })
    ).toThrow('authMechanismProperties must be a JSON object');
  });
});
