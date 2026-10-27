import { expect, it } from 'vitest';
import { exportRead } from './transfers';
import { parseShellQuery } from './shell-query';

it('keeps explicit query skip/limit and projected source collection', () => {
  const parsed = parseShellQuery(
    'db.other.find({active:true}, {name:1}).sort({name:1}).skip(5).limit(2000)'
  );
  if (!parsed.ok) throw new Error(parsed.message);
  expect(exportRead(parsed.value, 'fallback')).toEqual({
    collection: 'other',
    source: {
      kind: 'find',
      filter: { active: true },
      projection: { name: 1 },
      sort: { name: 1 },
      skip: 5,
      limit: 2000
    }
  });
});
it('does not introduce table page size/skip into an unrestricted query', () => {
  expect(exportRead({ op: 'find', filter: {} }, 'col')?.source).toMatchObject({
    kind: 'find',
    skip: undefined,
    limit: undefined
  });
  expect(exportRead({ op: 'findOne', filter: {} }, 'col')?.source).toMatchObject({ limit: 1 });
});
it('preserves aggregate stages and rejects nested output stages', () => {
  const pipeline = [{ $match: { active: true } }, { $limit: 12 }];
  expect(exportRead({ op: 'aggregate', pipeline }, 'col')?.source).toEqual({
    kind: 'aggregate',
    pipeline
  });
  expect(() =>
    exportRead({ op: 'aggregate', pipeline: [{ $facet: { nested: [{ $merge: 'col' }] } }] }, 'col')
  ).toThrow();
  expect(exportRead({ op: 'find', filter: {}, explain: true }, 'col')).toBeUndefined();
});
