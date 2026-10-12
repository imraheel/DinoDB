import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { inferSchema } from './schema';

describe('inferSchema', () => {
  it('returns an empty list for no documents or empty documents', () => {
    expect(inferSchema([])).toEqual([]);
    expect(inferSchema([{}, {}])).toEqual([]);
  });

  it('records objectid for ObjectId values', () => {
    expect(inferSchema([{ _id: new ObjectId() }])).toEqual([{ path: '_id', type: 'objectid' }]);
  });

  it('records primitive types from typeof', () => {
    expect(inferSchema([{ name: 'a' }, { age: 3 }, { ok: true }])).toEqual([
      { path: 'name', type: 'string' },
      { path: 'age', type: 'number' },
      { path: 'ok', type: 'boolean' }
    ]);
  });

  it('joins multiple types per path sorted alphabetically', () => {
    expect(inferSchema([{ v: null }, { v: 1 }])).toEqual([{ path: 'v', type: 'null | number' }]);
    expect(inferSchema([{ v: 1 }, { v: null }, { v: 'x' }])).toEqual([
      { path: 'v', type: 'null | number | string' }
    ]);
  });

  it('walks nested plain objects with dot paths', () => {
    expect(inferSchema([{ address: { city: 'Paris' } }])).toEqual([
      { path: 'address.city', type: 'string' }
    ]);
    expect(inferSchema([{ a: { b: { c: 1 } } }])).toEqual([{ path: 'a.b.c', type: 'number' }]);
  });

  it('records arrays without descending into them', () => {
    expect(inferSchema([{ tags: ['a', 'b'] }])).toEqual([{ path: 'tags', type: 'array' }]);
  });

  it('records dates without descending into them', () => {
    expect(inferSchema([{ createdAt: new Date('2024-01-01T00:00:00.000Z') }])).toEqual([
      { path: 'createdAt', type: 'date' }
    ]);
  });

  it('records null values', () => {
    expect(inferSchema([{ missing: null }])).toEqual([{ path: 'missing', type: 'null' }]);
  });

  it('preserves first-seen path order across documents', () => {
    expect(inferSchema([{ a: 1 }, { b: 2, a: 3 }])).toEqual([
      { path: 'a', type: 'number' },
      { path: 'b', type: 'number' }
    ]);
  });

  it('never produces paths longer than six segments', () => {
    const deep = { l1: { l2: { l3: { l4: { l5: { l6: { l7: { l8: 1 } } } } } } } };
    const fields = inferSchema([deep]);
    for (const field of fields) {
      expect(field.path.split('.').length).toBeLessThanOrEqual(6);
    }
    expect(fields).toEqual([{ path: 'l1.l2.l3.l4.l5.l6', type: 'object' }]);
  });
});
