import { ObjectId, type MongoClient } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { executeRequest } from './operations';

const id = new ObjectId('65f000000000000000000001');

function clientWithCollection(collection: Record<string, unknown>): MongoClient {
  return {
    db: vi.fn().mockReturnValue({ collection: vi.fn().mockReturnValue(collection) })
  } as unknown as MongoClient;
}

describe('nested read execution', () => {
  it('runs distinct with BSON filters and serializes ObjectIds', async () => {
    const distinct = vi.fn().mockResolvedValue([id]);
    const client = clientWithCollection({ distinct });
    const result = await executeRequest(
      { client },
      {
        kind: 'nestedRead',
        database: 'crm',
        collection: 'numbers',
        method: 'distinct',
        field: '_id',
        filter: { setId: { $oid: id.toHexString() } }
      },
      5000
    );
    expect(distinct).toHaveBeenCalledWith('_id', { setId: id }, { maxTimeMS: 5000 });
    expect(result).toEqual({ values: [{ $oid: id.toHexString() }] });
  });

  it('runs find with projection and sort and returns documents', async () => {
    const cursor = {
      limit: vi.fn().mockReturnThis(),
      async *[Symbol.asyncIterator]() {
        yield { _id: id };
      }
    };
    const find = vi.fn().mockReturnValue(cursor);
    const client = clientWithCollection({ find });
    const result = await executeRequest(
      { client },
      {
        kind: 'nestedRead',
        database: 'crm',
        collection: 'numbers',
        method: 'find',
        filter: { _id: { $oid: id.toHexString() } },
        projection: { _id: 1 },
        sort: { _id: -1 },
        limit: 5
      },
      5000
    );
    expect(find).toHaveBeenCalledWith(
      { _id: id },
      {
        maxTimeMS: 5000,
        projection: { _id: 1 },
        sort: { _id: -1 }
      }
    );
    expect(cursor.limit).toHaveBeenCalledWith(5);
    expect(result).toEqual({ values: [{ _id: { $oid: id.toHexString() } }] });
  });

  it('runs read-only aggregate and rejects output stages', async () => {
    const aggregate = vi.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { _id: id };
      }
    });
    const client = clientWithCollection({ aggregate });
    const result = await executeRequest(
      { client },
      {
        kind: 'nestedRead',
        database: 'crm',
        collection: 'numbers',
        method: 'aggregate',
        pipeline: [{ $match: { _id: { $oid: id.toHexString() } } }]
      },
      5000
    );
    expect(aggregate).toHaveBeenCalledWith([{ $match: { _id: id } }], {
      maxTimeMS: 5000
    });
    expect(result).toEqual({ values: [{ _id: { $oid: id.toHexString() } }] });
    await expect(
      executeRequest(
        { client },
        {
          kind: 'nestedRead',
          database: 'crm',
          collection: 'numbers',
          method: 'aggregate',
          pipeline: [{ $out: 'other' }]
        },
        5000
      )
    ).rejects.toThrow('read-only');
  });

  it('accepts more than 10000 distinct values', async () => {
    const distinct = vi.fn().mockResolvedValue(Array.from({ length: 10001 }, (_, n) => n));
    const client = clientWithCollection({ distinct });
    const result = await executeRequest(
      { client },
      {
        kind: 'nestedRead',
        database: 'crm',
        collection: 'numbers',
        method: 'distinct',
        field: 'n'
      },
      5000
    );
    expect((result as { values: unknown[] }).values).toHaveLength(10001);
  });

  it('uses the size guard instead of an implicit find limit', async () => {
    const cursor = {
      limit: vi.fn().mockReturnThis(),
      async *[Symbol.asyncIterator]() {
        yield { _id: id };
      }
    };
    const client = clientWithCollection({ find: vi.fn().mockReturnValue(cursor) });
    await executeRequest(
      { client },
      { kind: 'nestedRead', database: 'crm', collection: 'numbers', method: 'find', limit: 0 },
      5000
    );
    expect(cursor.limit).not.toHaveBeenCalled();
  });
});
