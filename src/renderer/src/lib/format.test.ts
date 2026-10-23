import { describe, expect, it } from 'vitest';
import { formatCell, getColumns } from './format';
import type { SchemaField } from '../../../shared/types';

describe('formatCell', () => {
  it('returns an empty string for null and undefined', () => {
    expect(formatCell(null)).toBe('');
    expect(formatCell(undefined)).toBe('');
  });

  it('formats numbers, booleans and strings directly', () => {
    expect(formatCell(42)).toBe('42');
    expect(formatCell(1.5)).toBe('1.5');
    expect(formatCell(0)).toBe('0');
    expect(formatCell(true)).toBe('true');
    expect(formatCell(false)).toBe('false');
    expect(formatCell('hello')).toBe('hello');
  });

  it('formats $oid as a hex string', () => {
    expect(formatCell({ $oid: '65f1c0ffee65f1c0ffee65f1' })).toBe('65f1c0ffee65f1c0ffee65f1');
  });

  it('formats $date from an ISO string or epoch milliseconds', () => {
    expect(formatCell({ $date: '2024-01-02T03:04:05.000Z' })).toBe('2024-01-02T03:04:05.000Z');
    const ms = Date.UTC(2024, 0, 2, 3, 4, 5);
    expect(formatCell({ $date: ms })).toBe(new Date(ms).toISOString());
  });

  it('formats $binary with a base64 payload', () => {
    expect(formatCell({ $binary: { base64: 'AQID', subType: '00' } })).toBe(
      'Binary(4 base64 chars)'
    );
    expect(formatCell({ $binary: 'AQIDBA==' })).toBe('Binary(8 base64 chars)');
  });

  it('formats extended JSON number types as their inner string', () => {
    expect(formatCell({ $numberDecimal: '1.5' })).toBe('1.5');
    expect(formatCell({ $numberLong: '9007199254740993' })).toBe('9007199254740993');
    expect(formatCell({ $numberInt: '7' })).toBe('7');
  });

  it('serializes nested objects and arrays as JSON', () => {
    expect(formatCell({ a: { b: [1, 2] } })).toBe(JSON.stringify({ a: { b: [1, 2] } }));
    expect(formatCell([1, 'x', null])).toBe('[1,"x",null]');
    expect(formatCell({ name: 'Ada', age: 36 })).toBe('{"name":"Ada","age":36}');
  });
});

describe('getColumns', () => {
  const schema = (paths: string[]): SchemaField[] =>
    paths.map((path) => ({ path, type: 'string' }));

  it('returns top-level schema paths first in field order, excluding dotted paths', () => {
    const fields = schema(['_id', 'name', 'address.city', 'tags']);
    const documents = [
      { _id: 1, name: 'a', age: 3 },
      { name: 'b', email: 'e' }
    ];
    expect(getColumns(fields, documents)).toEqual(['_id', 'name', 'tags', 'age', 'email']);
  });

  it('unions keys across all documents preserving first-seen order', () => {
    const documents = [
      { _id: 1, zeta: true },
      { alpha: 'x', _id: 2 },
      { beta: 3, zeta: false }
    ];
    expect(getColumns([], documents)).toEqual(['_id', 'zeta', 'alpha', 'beta']);
  });

  it('skips document keys already provided by the schema', () => {
    const fields = schema(['status']);
    const documents = [
      { status: 'a', extra: 1 },
      { status: 'b', other: 2 }
    ];
    expect(getColumns(fields, documents)).toEqual(['status', 'extra', 'other']);
  });

  it('ignores dotted schema paths entirely', () => {
    const fields = schema(['a.b', 'c.d']);
    expect(getColumns(fields, [{ _id: 1, a: { b: 2 } }])).toEqual(['_id', 'a']);
  });

  it('skips non-object documents', () => {
    const fields = schema(['name']);
    expect(getColumns(fields, [null, 'str', 42, { name: 'a', extra: 1 }])).toEqual([
      'name',
      'extra'
    ]);
  });
});
