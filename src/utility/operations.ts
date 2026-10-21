import { BSON, type Document, type FindOptions, type IndexSpecification, type MongoClient } from 'mongodb';
import type { CollectionIndexInfo, UtilityRequest, UtilityResponses } from '../shared/ipc';
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

export function hasOutputStage(pipeline: unknown): boolean {
  if (!Array.isArray(pipeline)) return false;
  return pipeline.some(
    (stage) =>
      stage !== null &&
      typeof stage === 'object' &&
      !Array.isArray(stage) &&
      ('$out' in stage || '$merge' in stage)
  );
}

export function buildPipeline(pipeline: unknown, limit: number): Document[] {
  const stages = (Array.isArray(pipeline) ? pipeline : []).map(
    (stage) => fromWire(stage) as Document
  );
  if (!hasOutputStage(pipeline)) stages.push({ $limit: clampLimit(limit) });
  return stages;
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
          { upsert: request.upsert ?? false, maxTimeMS: maxTimeMs }
        );
      return {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        deleted: 0,
        insertedId: result.upsertedId != null ? toWire(result.upsertedId) : null
      };
    }
    case 'deleteOne': {
      const result = await ctx.client
        .db(request.database)
        .collection(request.collection)
        .deleteOne(fromWire(request.target) as Document, { maxTimeMS: maxTimeMs });
      return { matched: 0, modified: 0, deleted: result.deletedCount, insertedId: null };
    }
    case 'insertMany': {
      const result = await ctx.client
        .db(request.database)
        .collection(request.collection)
        .insertMany(
          request.documents.map((doc) => fromWire(doc) as Document),
          { maxTimeMS: maxTimeMs }
        );
      const first = result.insertedIds[0];
      return { matched: 0, modified: 0, deleted: 0, insertedId: first != null ? toWire(first) : null };
    }
    case 'deleteMany': {
      const result = await ctx.client
        .db(request.database)
        .collection(request.collection)
        .deleteMany(fromWire(request.filter) as Document, { maxTimeMS: maxTimeMs });
      return { matched: 0, modified: 0, deleted: result.deletedCount, insertedId: null };
    }
    case 'updateOne':
    case 'updateMany': {
      const collection = ctx.client.db(request.database).collection(request.collection);
      const filter = fromWire(request.filter) as Document;
      const update = fromWire(request.update) as Document;
      const options = { upsert: request.upsert, maxTimeMS: maxTimeMs };
      const result =
        request.kind === 'updateOne'
          ? await collection.updateOne(filter, update, options)
          : await collection.updateMany(filter, update, options);
      return {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        deleted: 0,
        insertedId: result.upsertedId != null ? toWire(result.upsertedId) : null
      };
    }
    case 'countDocuments': {
      const count = await ctx.client
        .db(request.database)
        .collection(request.collection)
        .countDocuments(fromWire(request.filter) as Document, { maxTimeMS: maxTimeMs });
      return { count };
    }
    case 'aggregate': {
      const guarded = !hasOutputStage(request.pipeline);
      const documents = await ctx.client
        .db(request.database)
        .collection(request.collection)
        .aggregate(buildPipeline(request.pipeline, request.limit), { maxTimeMS: maxTimeMs })
        .toArray();
      return {
        documents: documents.map((doc) => toWire(doc)),
        truncated: guarded && documents.length >= clampLimit(request.limit)
      };
    }
    case 'explainFind': {
      const options: FindOptions = {
        ...buildFindOptions({
          projection: request.projection,
          sort: request.sort,
          skip: request.skip,
          limit: request.limit
        }),
        maxTimeMS: maxTimeMs
      };
      const plan = await ctx.client
        .db(request.database)
        .collection(request.collection)
        .find(fromWire(request.filter) as Document, options)
        .limit(clampLimit(request.limit))
        .explain('executionStats');
      return { plan: toWire(plan) };
    }
    case 'explainAggregate': {
      const plan = await ctx.client
        .db(request.database)
        .collection(request.collection)
        .aggregate(buildPipeline(request.pipeline, request.limit), { maxTimeMS: maxTimeMs })
        .explain('executionStats');
      return { plan: toWire(plan) };
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
    case 'dropCollection': {
      await ctx.client
        .db(request.database)
        .dropCollection(request.collection, { maxTimeMS: maxTimeMs });
      return { ok: true };
    }
    case 'renameCollection': {
      await ctx.client
        .db('admin')
        .command(
          {
            renameCollection: `${request.database}.${request.collection}`,
            to: `${request.database}.${request.newName}`
          },
          { timeoutMS: maxTimeMs }
        );
      return { ok: true };
    }
    case 'duplicateCollection': {
      await ctx.client
        .db(request.database)
        .collection(request.collection)
        .aggregate([{ $out: request.newName }], { maxTimeMS: maxTimeMs })
        .toArray();
      return { ok: true };
    }
    case 'clearCollection': {
      const result = await ctx.client
        .db(request.database)
        .collection(request.collection)
        .deleteMany({}, { maxTimeMS: maxTimeMs });
      return { deleted: result.deletedCount };
    }
    case 'createCollection': {
      await ctx.client.db(request.database).createCollection(request.name);
      return { ok: true };
    }
    case 'dropDatabase': {
      await ctx.client.db(request.database).dropDatabase({ maxTimeMS: maxTimeMs });
      return { ok: true };
    }
    case 'listIndexes': {
      const collection = ctx.client.db(request.database).collection(request.collection);
      const specs = await collection.listIndexes({ maxTimeMS: maxTimeMs }).toArray();
      let sizes: Record<string, number> = {};
      try {
        const stats = await ctx.client
          .db(request.database)
          .command({ collStats: request.collection, scale: 1 });
        sizes = (stats.indexSizes ?? {}) as Record<string, number>;
      } catch {
        sizes = {};
      }
      let usage: Record<string, number> = {};
      try {
        const statRows = await collection
          .aggregate([{ $indexStats: {} }], { maxTimeMS: maxTimeMs })
          .toArray();
        for (const row of statRows) {
          const name = (row as Record<string, unknown>).name;
          if (typeof name === 'string') {
            usage[name] = Number((row as Record<string, unknown>).accessOps ?? 0);
          }
        }
      } catch {
        usage = {};
      }
      const indexes: CollectionIndexInfo[] = specs.map((spec) => {
        const record = spec as Record<string, unknown>;
        const name = String(record.name ?? '');
        return {
          name,
          key: toWire(record.key ?? {}) as Record<string, unknown>,
          unique: record.unique === true,
          sparse: record.sparse === true,
          hidden: record.hidden === true,
          expireAfterSeconds:
            typeof record.expireAfterSeconds === 'number'
              ? record.expireAfterSeconds
              : undefined,
          partialFilterExpression:
            record.partialFilterExpression !== undefined
              ? (toWire(record.partialFilterExpression) as Record<string, unknown>)
              : undefined,
          sizeBytes: sizes[name],
          usageCount: usage[name]
        };
      });
      return { indexes };
    }
    case 'createIndex': {
      const key = fromWire(request.key) as IndexSpecification;
      const options = fromWire(request.options) as Record<string, unknown>;
      const name = await ctx.client
        .db(request.database)
        .collection(request.collection)
        .createIndex(key, { ...options, maxTimeMS: maxTimeMs });
      return { ok: true, name };
    }
    case 'dropIndex': {
      await ctx.client
        .db(request.database)
        .collection(request.collection)
        .dropIndex(request.name, { maxTimeMS: maxTimeMs });
      return { ok: true };
    }
    case 'hideIndex': {
      const specs = await ctx.client
        .db(request.database)
        .collection(request.collection)
        .listIndexes({ maxTimeMS: maxTimeMs })
        .toArray();
      const spec = specs.find(
        (candidate) => (candidate as Record<string, unknown>).name === request.name
      );
      if (spec === undefined) throw new Error(`Index not found: ${request.name}`);
      const keyPattern = fromWire((spec as Record<string, unknown>).key ?? {});
      await ctx.client.db(request.database).command({
        collMod: request.collection,
        index: { keyPattern, hidden: request.hidden }
      });
      return { ok: true };
    }
    default:
      return assertNever(request);
  }
}
