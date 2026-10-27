import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BSON,
  MongoBulkWriteError,
  type WriteError,
  type BulkWriteResult,
  type Document,
  type MongoClient
} from 'mongodb';
import { runTransfer } from './transfer-runner';
import type { TransferJob, TransferProgress } from '../shared/transfer';
import { jsonText } from './transfer-codecs';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});
async function setup(direction: 'import' | 'export', format: 'json' | 'csv' | 'bson' = 'json') {
  const dir = await mkdtemp(join(tmpdir(), 'nexdb-transfer-'));
  dirs.push(dir);
  const job = {
    tabId: 'test',
    direction,
    format,
    filePath: join(dir, `data.${format}`),
    database: 'db',
    collection: 'col',
    source: { kind: 'collection' }
  } as TransferJob;
  const events: TransferProgress[] = [];
  const abort = new AbortController();
  const insertMany = vi.fn(async (docs: Document[]) => ({ insertedCount: docs.length }));
  const close = vi.fn(async () => {});
  const cursor = {
    batchSize: vi.fn(),
    close,
    async *[Symbol.asyncIterator]() {
      yield { a: 'first' };
      yield { a: 'second', late: 'value' };
    }
  };
  const find = vi.fn(() => cursor);
  const aggregate = vi.fn(() => cursor);
  const client = {
    connect: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    db: () => ({ collection: () => ({ find, aggregate, insertMany }) })
  } as unknown as MongoClient;
  const run = () => runTransfer(job, client, abort.signal, (event) => events.push(event));
  return { dir, job, events, abort, insertMany, client, find, aggregate, run, close };
}

it('exports JSON without imposing the table limit and closes the cursor', async () => {
  const ctx = await setup('export');
  await ctx.run();
  expect(JSON.parse(await readFile(ctx.job.filePath, 'utf8'))).toEqual([
    { a: 'first' },
    { a: 'second', late: 'value' }
  ]);
  expect(ctx.find.mock.calls[0]).toHaveLength(2);
  expect(ctx.events.at(-1)).toMatchObject({ status: 'completed', documents: 2 });
  expect(await readdir(ctx.dir)).toEqual(['data.json']);
  expect(ctx.close).toHaveBeenCalled();
});
it('discovers CSV fields in later documents without repeating the query', async () => {
  const ctx = await setup('export', 'csv');
  await ctx.run();
  expect(await readFile(ctx.job.filePath, 'utf8')).toBe('a,late\r\nfirst,\r\nsecond,value\r\n');
  expect(ctx.find).toHaveBeenCalledTimes(1);
  expect(ctx.events.some((event) => event.phase === 'Discovering CSV columns')).toBe(true);
  expect(await readdir(ctx.dir)).toEqual(['data.csv']);
});
it('exports selected documents without querying and preserves BSON types', async () => {
  const ctx = await setup('export', 'bson');
  const original = { _id: new BSON.ObjectId(), n: BSON.Long.fromString('9007199254740993') };
  ctx.job.source = {
    kind: 'selected',
    documents: [BSON.EJSON.serialize(original, { relaxed: false })]
  };
  await ctx.run();
  expect(ctx.find).not.toHaveBeenCalled();
  expect(
    jsonText(BSON.deserialize(await readFile(ctx.job.filePath), { promoteValues: false }))
  ).toBe(jsonText(original));
});
it('cancels exports while preserving an existing destination and removes temporary files', async () => {
  const ctx = await setup('export');
  await writeFile(ctx.job.filePath, 'existing');
  ctx.abort.abort();
  await ctx.run();
  expect(await readFile(ctx.job.filePath, 'utf8')).toBe('existing');
  expect(ctx.events.at(-1)?.status).toBe('cancelled');
  expect(await readdir(ctx.dir)).toEqual(['data.json']);
});
it('batches imports and reports confirmed partial success on duplicate IDs', async () => {
  const ctx = await setup('import');
  await writeFile(ctx.job.filePath, JSON.stringify(Array.from({ length: 501 }, (_, n) => ({ n }))));
  ctx.insertMany.mockImplementationOnce(async (docs) => ({ insertedCount: docs.length }));
  ctx.insertMany.mockRejectedValueOnce(
    new MongoBulkWriteError(
      {
        message: 'duplicate',
        code: 11000,
        writeErrors: [{ code: 11000, index: 0, errmsg: 'duplicate' }] as WriteError[]
      },
      {
        insertedCount: 0,
        getWriteConcernError: () => undefined
      } as unknown as BulkWriteResult
    )
  );
  await ctx.run();
  expect(ctx.insertMany.mock.calls.map(([docs]) => docs.length)).toEqual([500, 1]);
  expect(ctx.events.at(-1)).toMatchObject({
    status: 'failed',
    documents: 500,
    uncertainBatch: false
  });
});
it('marks the final batch uncertain for network errors', async () => {
  const ctx = await setup('import');
  await writeFile(ctx.job.filePath, '[{}]');
  ctx.insertMany.mockRejectedValue(new Error('connection lost'));
  await ctx.run();
  expect(ctx.events.at(-1)).toMatchObject({ status: 'failed', documents: 0, uncertainBatch: true });
});
it('waits for the current insert acknowledgement before cooperative cancellation', async () => {
  const ctx = await setup('import');
  await writeFile(ctx.job.filePath, '[{}]');
  ctx.insertMany.mockImplementation(async () => {
    ctx.abort.abort();
    return { insertedCount: 1 };
  });
  await ctx.run();
  expect(ctx.events.at(-1)).toMatchObject({
    status: 'cancelled',
    documents: 1,
    uncertainBatch: false
  });
});
it('rejects output pipelines before issuing an aggregate', async () => {
  const ctx = await setup('export');
  ctx.job.source = { kind: 'aggregate', pipeline: [{ $merge: 'other' }] };
  await ctx.run();
  expect(ctx.aggregate).not.toHaveBeenCalled();
  expect(ctx.events.at(-1)).toMatchObject({ status: 'failed' });
  expect(await readdir(ctx.dir)).toEqual([]);
});

it('uses per-iteration cursor timeouts and preserves explicit query options', async () => {
  const ctx = await setup('export');
  ctx.job.source = {
    kind: 'find',
    filter: { active: true },
    projection: { name: 1 },
    sort: { name: 1 },
    skip: 5,
    limit: 2000
  };
  await ctx.run();
  expect(ctx.find).toHaveBeenCalledWith(
    { active: true },
    expect.objectContaining({
      skip: 5,
      limit: 2000,
      timeoutMode: 'iteration',
      timeoutMS: 30000,
      projection: { name: 1 },
      sort: { name: 1 }
    })
  );
  expect(ctx.events.at(-1)?.status).toBe('completed');
});
it('streams aggregate exports without introducing a table limit', async () => {
  const ctx = await setup('export');
  const pipeline = [{ $match: { active: true } }, { $limit: 2000 }];
  ctx.job.source = { kind: 'aggregate', pipeline };
  await ctx.run();
  const [actualPipeline, options] = ctx.aggregate.mock.calls[0] as unknown as [
    Document[],
    Record<string, unknown>
  ];
  expect(JSON.parse(BSON.EJSON.stringify(actualPipeline, { relaxed: true }))).toEqual(pipeline);
  expect(options).toMatchObject({ timeoutMode: 'iteration', timeoutMS: 30000 });
  expect(ctx.events.at(-1)?.status).toBe('completed');
});
it('cleans up after a cursor failure and leaves an existing destination intact', async () => {
  const ctx = await setup('export', 'csv');
  await writeFile(ctx.job.filePath, 'original');
  ctx.find.mockImplementation(() => ({
    batchSize: vi.fn(),
    close: ctx.close,
    async *[Symbol.asyncIterator]() {
      yield { a: 'first' };
      throw new Error('cursor failed');
    }
  }));
  await ctx.run();
  expect(ctx.events.at(-1)).toMatchObject({ status: 'failed', error: 'cursor failed' });
  expect(await readFile(ctx.job.filePath, 'utf8')).toBe('original');
  expect(await readdir(ctx.dir)).toEqual(['data.csv']);
});
it('emits periodic elapsed-time progress while awaiting a database response', async () => {
  const ctx = await setup('export');
  vi.useFakeTimers();
  try {
    let connect!: () => void;
    vi.mocked(ctx.client.connect).mockImplementation(
      () =>
        new Promise((resolve) => {
          connect = () => resolve(ctx.client);
        })
    );
    const running = ctx.run();
    await vi.advanceTimersByTimeAsync(1000);
    expect(
      ctx.events.some((event) => event.elapsedMs >= 1000 && event.phase === 'Connecting')
    ).toBe(true);
    connect();
    await running;
    const count = ctx.events.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(ctx.events).toHaveLength(count);
  } finally {
    vi.useRealTimers();
  }
});

it('keeps uncertainty when the driver wraps a network failure as a bulk write error', async () => {
  const ctx = await setup('import');
  await writeFile(ctx.job.filePath, '[{}]');
  ctx.insertMany.mockRejectedValue(
    new MongoBulkWriteError(new Error('connection lost'), {
      insertedCount: 0,
      getWriteConcernError: () => undefined
    } as unknown as BulkWriteResult)
  );
  await ctx.run();
  expect(ctx.events.at(-1)).toMatchObject({ status: 'failed', documents: 0, uncertainBatch: true });
});

it.each(['json', 'csv', 'bson'] as const)(
  'round-trips an empty collection through %s',
  async (format) => {
    const ctx = await setup('export', format);
    ctx.find.mockImplementation(() => ({
      batchSize: vi.fn(),
      close: ctx.close,
      async *[Symbol.asyncIterator]() {
        /* Empty collection. */
      }
    }));
    await ctx.run();
    expect(ctx.events.at(-1)).toMatchObject({ status: 'completed', documents: 0 });
    ctx.job.direction = 'import';
    await ctx.run();
    expect(ctx.events.at(-1)).toMatchObject({ status: 'completed', documents: 0 });
    expect(ctx.insertMany).not.toHaveBeenCalled();
  }
);
