import { describe, expect, it, vi } from 'vitest';
import { resolveNestedReads } from './nested-reads';
import { parseShellQuery } from './shell-query';

describe('resolveNestedReads', () => {
  it('resolves distinct() in a find filter with ObjectIds intact', async () => {
    const execute = vi.fn().mockResolvedValue([{ $oid: '6a7492cbd2e144bf25956830' }]);
    const source = `db.getCollection("crm_leads").find({
      companyId: ObjectId("6a74885a453f37313482b83c"),
      setNumberId: { $in: db.datasets_numbers.distinct('_id', {
        setId: ObjectId("6a7492cbd2e144bf25956830"),
        isAssigned: true
      }) }
    })`;
    const resolved = await resolveNestedReads(source, 'crm', execute);
    expect(execute).toHaveBeenCalledWith({
      kind: 'nestedRead',
      database: 'crm',
      collection: 'datasets_numbers',
      method: 'distinct',
      field: '_id',
      filter: {
        setId: { $oid: '6a7492cbd2e144bf25956830' },
        isAssigned: true
      }
    });
    expect(parseShellQuery(resolved)).toEqual({
      ok: true,
      value: {
        op: 'find',
        collection: 'crm_leads',
        filter: {
          companyId: { $oid: '6a74885a453f37313482b83c' },
          setNumberId: { $in: [{ $oid: '6a7492cbd2e144bf25956830' }] }
        }
      }
    });
  });

  it('resolves find().toArray() and allows mapping its documents', async () => {
    const execute = vi.fn().mockResolvedValue([{ _id: { $oid: '65f000000000000000000001' } }]);
    const resolved = await resolveNestedReads(
      `find({ owner: { $in: db.users.find({ active: true }, { _id: 1 }).sort({ _id: 1 }).limit(5).toArray().map(user => user._id) } })`,
      'app',
      execute
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'find',
        collection: 'users',
        filter: { active: true },
        projection: { _id: 1 },
        sort: { _id: 1 },
        limit: 5
      })
    );
    expect(parseShellQuery(resolved)).toEqual({
      ok: true,
      value: { op: 'find', filter: { owner: { $in: [{ $oid: '65f000000000000000000001' }] } } }
    });
  });

  it('resolves aggregate().toArray() and nested reads inside another read', async () => {
    const execute = vi.fn().mockImplementation(async (request) => {
      if (request.method === 'distinct') return [4];
      return [{ id: 4 }];
    });
    const resolved = await resolveNestedReads(
      `find({ x: { $in: db.getCollection('items').aggregate([{ $match: { x: { $in: db.tags.distinct('id', {}) } } }, { $project: { id: 1 } }]).toArray().map(item => item.id) } })`,
      'app',
      execute
    );
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'aggregate',
        collection: 'items',
        pipeline: [{ $match: { x: { $in: [4] } } }, { $project: { id: 1 } }]
      })
    );
    expect(parseShellQuery(resolved)).toEqual({
      ok: true,
      value: { op: 'find', filter: { x: { $in: [4] } } }
    });
  });

  it('ignores text in strings and requires cursor materialization', async () => {
    const execute = vi.fn();
    expect(await resolveNestedReads(`find({ text: 'db.users.find({})' })`, 'app', execute)).toBe(
      `find({ text: 'db.users.find({})' })`
    );
    expect(
      await resolveNestedReads(`find({ text: /db.users.distinct('x')/ })`, 'app', execute)
    ).toBe(`find({ text: /db.users.distinct('x')/ })`);
    await expect(
      resolveNestedReads('find({ x: db.users.find({}) })', 'app', execute)
    ).rejects.toThrow('requires .toArray()');
    expect(execute).not.toHaveBeenCalled();
  });

  it('resolves nested reads in a bare filter object', async () => {
    const execute = vi.fn().mockResolvedValue([1, 2]);
    const resolved = await resolveNestedReads(
      '{ x: { $in: db.values.distinct("n") } }',
      'app',
      execute
    );
    expect(parseShellQuery(resolved)).toEqual({
      ok: true,
      value: { op: 'find', filter: { x: { $in: [1, 2] } } }
    });
  });
});
