import { describe, expect, it } from 'vitest';
import {
  formatIndexSize,
  formatIndexUsage,
  indexProperties,
  indexTypeLabel
} from './indexes';

describe('indexTypeLabel', () => {
  it('labels single ascending and descending keys', () => {
    expect(indexTypeLabel({ age: 1 })).toBe('ascending');
    expect(indexTypeLabel({ age: -1 })).toBe('descending');
  });

  it('labels special index types', () => {
    expect(indexTypeLabel({ loc: '2dsphere' })).toBe('2dsphere');
    expect(indexTypeLabel({ title: 'text' })).toBe('text');
    expect(indexTypeLabel({ token: 'hashed' })).toBe('hashed');
  });

  it('joins compound key parts with commas', () => {
    expect(indexTypeLabel({ a: 1, b: -1, c: 'text' })).toBe(
      'ascending, descending, text'
    );
  });
});

describe('indexProperties', () => {
  it('returns an em dash when there are no properties', () => {
    expect(indexProperties({ name: 'a_1', key: { a: 1 } })).toBe('—');
  });

  it('lists known flags in order', () => {
    expect(
      indexProperties({
        name: 'a_1',
        key: { a: 1 },
        unique: true,
        sparse: true,
        hidden: true,
        expireAfterSeconds: 60
      })
    ).toBe('unique, sparse, hidden, expireAfterSeconds=60');
  });

  it('labels partial indexes', () => {
    expect(
      indexProperties({
        name: 'a_1',
        key: { a: 1 },
        partialFilterExpression: { status: 'active' }
      })
    ).toBe('partial');
  });
});

describe('formatIndexSize', () => {
  it('formats bytes, KB, and MB', () => {
    expect(formatIndexSize(512)).toBe('512 B');
    expect(formatIndexSize(2048)).toBe('2.0 KB');
    expect(formatIndexSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('returns an em dash for undefined', () => {
    expect(formatIndexSize(undefined)).toBe('—');
  });
});

describe('formatIndexUsage', () => {
  it('formats counts and handles undefined', () => {
    expect(formatIndexUsage(1234)).toBe('1,234');
    expect(formatIndexUsage(0)).toBe('0');
    expect(formatIndexUsage(undefined)).toBe('—');
  });
});
