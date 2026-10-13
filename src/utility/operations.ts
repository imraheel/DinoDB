import { BSON, type Document, type FindOptions, type MongoClient } from 'mongodb';
import type { UtilityRequest, UtilityResponses } from '../shared/ipc';
import { inferSchema } from './schema';

export function toWire(value: unknown): unknown {
  return BSON.EJSON.serialize(value, { relaxed: true });
}

export function fromWire(value: unknown): unknown {
  return BSON.EJSON.deserialize(value as Document, { relaxed: true });
}

export function clampLimit(limit: number): number {
  return Math.min(1000, Math.max(1, limit));
}

export interface FindOptionsInput {
  projection?: unknown;
  sort?: unknown;
  skip?: number;
  limit: number;
}

export function buildFindOptions(input: FindOptionsInput): FindOptions {
  const options: FindOptions = { limit: clampLimit(input.limit) };
  if (input.projection !== undefined) {
    options.projection = fromWire(input.projection) as Document;
  }
  if (input.sort !== undefined) {
    options.sort = fromWire(input.sort) as NonNullable<FindOptions['sort']>;
  }
  if (input.skip !== undefined && input.skip > 0) {
    options.skip = input.skip;
  }
  return options;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected request kind: ${JSON.stringify(value)}`);
}

export async function executeRequest(
  ctx: { client: MongoClient },
  request: UtilityRequest,
  maxTimeMs: number
): Promise<UtilityResponses[UtilityRequest['kind']]> {
  switch (request.kind) {
    case 'ping': {
      try {
        const info = await ctx.client
          .db('admin')
          .command({ buildInfo: 1 }, { timeoutMS: Math.min(maxTimeMs, 5000) });
        return { version: typeof info.version === 'string' ? info.version : 'unknown' };
      } catch {
        return { version: 'unknown' };
      }
    }
    case 'listDatabases': {
      const result = await ctx.client.db().admin().listDatabases({ maxTimeMS: maxTimeMs });
      return { databases: result.databases.map((database) => database.name) };
    }
    case 'listCollections': {
      const cursor = ctx.client
        .db(request.database)
        .listCollections({}, { nameOnly: true, maxTimeMS: maxTimeMs });
      const collections = await cursor.toArray();
      return {
        collections: collections
          .map((info) => info.name)
          .filter((name) => !name.startsWith('system.'))
      };
    }
    case 'find': {
      const limit = clampLimit(request.limit);
      const options: FindOptions = {
        ...buildFindOptions({
          projection: request.projection,
          sort: request.sort,
          skip: request.skip,
          limit: request.limit
        }),
        maxTimeMS: maxTimeMs
      };
      const documents = await ctx.client
        .db(request.database)
        .collection(request.collection)
        .find(fromWire(request.filter) as Document, options)
        .limit(limit)
        .toArray();
      return {
        documents: documents.map((doc) => toWire(doc)),
        truncated: documents.length >= limit
      };
    }
    case 'insertOne': {
      const result = await ctx.client
        .db(request.database)
        .collection(request.collection)
        .insertOne(fromWire(request.document) as Document, { maxTimeMS: maxTimeMs });
      return {
        matched: 0,
        modified: 0,
        deleted: 0,
        insertedId: result.insertedId != null ? toWire(result.insertedId) : null
      };
    }
    case 'replaceOne': {
      const result = await ctx.client
        .db(request.database)
        .collection(request.collection)
        .replaceOne(
          fromWire(request.target) as Document,
          fromWire(request.document) as Document,
          { upsert: false, maxTimeMS: maxTimeMs }
        );
      return {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        deleted: 0,
        insertedId: null
      };
    }
    case 'deleteOne': {
      const result = await ctx.client
        .db(request.database)
        .collection(request.collection)
        .deleteOne(fromWire(request.target) as Document, { maxTimeMS: maxTimeMs });
      return { matched: 0, modified: 0, deleted: result.deletedCount, insertedId: null };
    }
    case 'inferSchema': {
      const limit = clampLimit(request.sampleSize);
      const documents = await ctx.client
        .db(request.database)
        .collection(request.collection)
        .find({}, { maxTimeMS: maxTimeMs })
        .limit(limit)
        .toArray();
      return { fields: inferSchema(documents) };
    }
    default:
      return assertNever(request);
  }
}
