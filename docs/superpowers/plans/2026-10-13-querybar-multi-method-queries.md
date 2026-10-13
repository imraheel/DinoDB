# QueryBar Multi-Method Queries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the QueryBar run the full core set of shell methods — `find`, `findOne`, `countDocuments`, `updateOne`, `updateMany`, `replaceOne`, `deleteOne`, `deleteMany`, `insertOne`, `insertMany`, `aggregate` — parsed from one shell-style query, with count/write results shown as a result card.

**Architecture:** `shell-query.ts` generalizes from find-only to a discriminated `ParsedQuery` union dispatched in `TabWorkspace`. New utility request kinds (`countDocuments`, `updateOne`, `updateMany`, `deleteMany`, `insertMany`, `aggregate`) reuse the existing `WriteResult`/`FindResult` shapes; `insertOne`/`replaceOne`/`deleteOne` already exist and their `target`/`document` fields map directly onto shell filter/replacement/document arguments. Per-tab state gains `card` (result card) and `lastRead` (snapshot of the last read text) so Refresh/row-CRUD/tab-activation re-run the **last read**, never the write sitting in the editor.

**Tech Stack:** Electron + React 19 + TypeScript, `mongodb` driver v7 inside the utility process, vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-09-nexdb-design.md` (update it in Task 6).

**Decisions (user-confirmed):** Core method set only · no confirmation dialogs for QueryBar writes · count/write results render a centered **result card** (replaces table area) · post-write shows the message "how many records are updated" via that card (no auto re-run).

---

## Locked design decisions

1. **`findOne` = `find` with `limit: 1`** (no new IPC kind; renders in the normal table).
2. **`deleteOne(filter)` → existing `deleteOne` kind** (`target` field carries the filter); `replaceOne`/`insertOne` likewise reuse existing kinds; `replaceOne` gains optional `upsert`.
3. **`Refresh`/tab-activation/row-CRUD re-run `lastRead`** (per-tab snapshot of last successful read text), never the editor's current text — otherwise Refresh after `deleteMany({…})` would execute the delete again. If `lastRead` is unset and the current text is a read, run it; if it's a write, do nothing.
4. **Chained `.sort()/.skip()/.limit()` remain find-only** and unknown chains (`.pretty()`, `.explain()`) stay silently tolerated (existing tested behavior).
5. **`$out`/`$merge` aggregate**: no `$limit` guard (utility `hasOutputStage`), dispatched as a write card with an explanatory message, and **not** recorded as `lastRead` (Refresh must not re-run it).
6. **Extra args we don't interpret are rejected** with a usage error (`countDocuments({}, {})`, `insertMany(docs, {ordered:false})`, `aggregate(pipe, {})` → error). Options objects we *do* interpret: `findOne` 3rd (`sort`), `update*`/`replaceOne` 3rd (`upsert`).
7. **Unsupported methods** (`db.coll.bulkWrite(…)`, `db.users.drop()`) produce `Unsupported method "x". Supported methods: …`; `getCollection(…)` with no method gets its own message.
8. Parser keeps its **bare-filter fallback** and empty-text → `find({})`; function renamed `parseShellFindQuery` → `parseShellQuery`, type `ParsedFindQuery` → `ParsedQuery` (only 3 files reference them).

## File map

```
src/shared/ipc.ts                         ← Task 1: 6 new kinds + replaceOne.upsert
src/utility/operations.ts                 ← Task 1: hasOutputStage, buildPipeline, new cases
src/utility/operations.test.ts            ← Task 1: buildPipeline/hasOutputStage tests
src/renderer/src/lib/shell-query.ts       ← Task 2: ParsedQuery union, parseShellQuery, QUERY_METHODS
src/renderer/src/lib/shell-query.test.ts  ← Task 2: full rewrite (existing find cases + new methods)
src/renderer/src/context/reducer.ts       ← Task 3: ResultCard, TabData.card/lastRead, tab/card, tab/read
src/renderer/src/context/reducer.test.ts  ← Task 3: new action tests
src/renderer/src/components/ResultCard.tsx← Task 4: new component
src/renderer/src/components/TabWorkspace.tsx ← Task 4: runParsed/runQuery/refresh dispatch
src/renderer/src/lib/monaco.ts            ← Task 5: method-name completions
README.md, docs/superpowers/specs/…, docs/superpowers/plans/… ← Task 6
```

---

## Contracts (authoritative — copy exactly)

### `ParsedQuery` + `QUERY_METHODS` (Task 2, `shell-query.ts`)

```ts
export const QUERY_METHODS = [
  'find', 'findOne', 'countDocuments', 'updateOne', 'updateMany',
  'replaceOne', 'deleteOne', 'deleteMany', 'insertOne', 'insertMany', 'aggregate'
] as const;
export type QueryMethod = (typeof QUERY_METHODS)[number];

export type ParsedQuery =
  | { op: 'find'; filter: unknown; projection?: unknown; sort?: unknown; skip?: number; limit?: number }
  | { op: 'findOne'; filter: unknown; projection?: unknown; sort?: unknown }
  | { op: 'countDocuments'; filter: unknown }
  | { op: 'updateOne'; filter: unknown; update: unknown; upsert: boolean }
  | { op: 'updateMany'; filter: unknown; update: unknown; upsert: boolean }
  | { op: 'replaceOne'; filter: unknown; replacement: unknown; upsert: boolean }
  | { op: 'deleteOne'; filter: unknown }
  | { op: 'deleteMany'; filter: unknown }
  | { op: 'insertOne'; document: unknown }
  | { op: 'insertMany'; documents: unknown[] }
  | { op: 'aggregate'; pipeline: unknown[] };

export type ShellQueryResult =
  | { ok: true; value: ParsedQuery }
  | { ok: false; message: string };
```

### `src/shared/ipc.ts` (Task 1) — replace `UtilityResponses` and `UtilityRequest`

```ts
export interface UtilityResponses {
  ping: { version: string };
  listDatabases: { databases: string[] };
  listCollections: { collections: string[] };
  find: FindResult;
  insertOne: WriteResult;
  insertMany: WriteResult;
  replaceOne: WriteResult;
  deleteOne: WriteResult;
  deleteMany: WriteResult;
  updateOne: WriteResult;
  updateMany: WriteResult;
  countDocuments: { count: number };
  aggregate: FindResult;
  inferSchema: { fields: SchemaField[] };
}

export type UtilityRequest =
  | { kind: 'ping' }
  | { kind: 'listDatabases' }
  | { kind: 'listCollections'; database: string }
  | { kind: 'find'; database: string; collection: string; filter: unknown; projection?: unknown; sort?: unknown; skip?: number; limit: number }
  | { kind: 'insertOne'; database: string; collection: string; document: unknown }
  | { kind: 'insertMany'; database: string; collection: string; documents: unknown[] }
  | { kind: 'replaceOne'; database: string; collection: string; target: unknown; document: unknown; upsert?: boolean }
  | { kind: 'deleteOne'; database: string; collection: string; target: unknown }
  | { kind: 'deleteMany'; database: string; collection: string; filter: unknown }
  | { kind: 'updateOne'; database: string; collection: string; filter: unknown; update: unknown; upsert: boolean }
  | { kind: 'updateMany'; database: string; collection: string; filter: unknown; update: unknown; upsert: boolean }
  | { kind: 'countDocuments'; database: string; collection: string; filter: unknown }
  | { kind: 'aggregate'; database: string; collection: string; pipeline: unknown[]; limit: number }
  | { kind: 'inferSchema'; database: string; collection: string; sampleSize: number };
```

### `ResultCard` + `TabData` + actions (Task 3, `reducer.ts`)

```ts
export type ResultCard =
  | { kind: 'count'; count: number }
  | {
      kind: 'write';
      op: string;
      matched: number;
      modified: number;
      deleted: number;
      inserted: number;
      insertedId: unknown | null;
      message?: string;
    };

export interface TabData {
  query: QueryInput;
  fields: SchemaField[];
  loading: boolean;
  findResults?: FindResult;
  card?: ResultCard;
  lastRead?: string;
  error?: string;
}
```

New actions: `| { type: 'tab/card'; tabId: string; card: ResultCard }` and `| { type: 'tab/read'; tabId: string; text: string }`.

---

## Task 1: Shared IPC types + utility operations (TDD)

**Files:** Modify `src/shared/ipc.ts`, `src/utility/operations.ts`; Test `src/utility/operations.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `src/utility/operations.test.ts` (extend the existing import line to `import { buildFindOptions, buildPipeline, fromWire, hasOutputStage, toWire } from './operations';`):

```ts
describe('hasOutputStage', () => {
  it('detects $out and $merge stages', () => {
    expect(hasOutputStage([{ $match: {} }])).toBe(false);
    expect(hasOutputStage([{ $match: {} }, { $out: 'dest' }])).toBe(true);
    expect(hasOutputStage([{ $merge: { into: 'dest' } }])).toBe(true);
    expect(hasOutputStage('nope')).toBe(false);
  });
});

describe('buildPipeline', () => {
  it('appends a clamped $limit guard when there is no output stage', () => {
    expect(buildPipeline([{ $match: { a: 1 } }], 50)).toEqual([{ $match: { a: 1 } }, { $limit: 50 }]);
    expect(buildPipeline([], 0)).toEqual([{ $limit: 1 }]);
    expect(buildPipeline([], 99999)).toEqual([{ $limit: 1000 }]);
  });

  it('does not append a guard when the pipeline writes output', () => {
    expect(buildPipeline([{ $match: {} }, { $out: 'dest' }], 50)).toEqual([
      { $match: {} },
      { $out: 'dest' }
    ]);
  });

  it('deserializes stages through fromWire', () => {
    expect(buildPipeline([{ $match: { _id: { $oid: '65f000000000000000000001' } } }], 10)).toEqual([
      { $match: { _id: expect.any(ObjectId) } },
      { $limit: 10 }
    ]);
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL** — `pnpm exec vitest run src/utility/operations.test.ts` → FAIL (`hasOutputStage` not exported).

- [ ] **Step 3: Update `src/shared/ipc.ts`** with the contracts shown above (replace `UtilityResponses` and `UtilityRequest` blocks verbatim).

- [ ] **Step 4: Implement in `src/utility/operations.ts`** — add after `clampLimit`:

```ts
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
```

Replace the existing `case 'replaceOne'` and insert the new cases after `case 'deleteOne'` (before `case 'inferSchema'`):

```ts
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
```

- [ ] **Step 5: Verify** — `pnpm exec vitest run src/utility/operations.test.ts` → PASS; `pnpm typecheck` → PASS (no renderer changes yet).

- [ ] **Step 6: Commit** — `git add src/shared/ipc.ts src/utility/operations.ts src/utility/operations.test.ts && git commit -m "add countDocuments, update, deleteMany, insertMany and aggregate ipc operations"`

---

## Task 2: Generalize the parser (TDD)

**Files:** Test `src/renderer/src/lib/shell-query.test.ts` (full rewrite); Modify `src/renderer/src/lib/shell-query.ts` (full rewrite)

- [ ] **Step 1: Rewrite `src/renderer/src/lib/shell-query.test.ts`** — full file:

```ts
import { describe, expect, it } from 'vitest';
import { parseShellQuery } from './shell-query';

function parseOk(text: string) {
  const result = parseShellQuery(text);
  if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
  return result.value;
}

function parseErr(text: string): string {
  const result = parseShellQuery(text);
  if (result.ok) throw new Error('expected a parse failure');
  return result.message;
}

describe('parseShellQuery', () => {
  it('treats empty text as a match-all find', () => {
    expect(parseOk('')).toEqual({ op: 'find', filter: {} });
    expect(parseOk('   \n  ')).toEqual({ op: 'find', filter: {} });
  });

  it('parses the default seeded query text', () => {
    expect(parseOk('db.getCollection("coll").find({\n  \n})')).toEqual({
      op: 'find',
      filter: {}
    });
  });

  it('accepts a bare filter object without find()', () => {
    expect(parseOk('{ active: true, name: "Ada" }')).toEqual({
      op: 'find',
      filter: { active: true, name: 'Ada' }
    });
    expect(parseOk('{"active": true}')).toEqual({ op: 'find', filter: { active: true } });
  });

  it('parses find(filter) and find(filter, projection)', () => {
    expect(parseOk('find()')).toEqual({ op: 'find', filter: {} });
    expect(parseOk('find({})')).toEqual({ op: 'find', filter: {} });
    expect(parseOk('find({ a: 1 }, { b: 1 })')).toEqual({
      op: 'find',
      filter: { a: 1 },
      projection: { b: 1 }
    });
  });

  it('parses a full shell query with chained sort, skip and limit', () => {
    const text = `db.getCollection("crm_leads").find({
      companyId: ObjectId("6a74885a453f37313482b83c"),
      leadPhones: '9196711989'
    }, {
      leadPhones: 1
    }).sort({ _id: -1 }).skip(10).limit(5)`;
    expect(parseOk(text)).toEqual({
      op: 'find',
      filter: { companyId: { $oid: '6a74885a453f37313482b83c' }, leadPhones: '9196711989' },
      projection: { leadPhones: 1 },
      sort: { _id: -1 },
      skip: 10,
      limit: 5
    });
  });

  it('ignores leading statements, string lookalikes and unknown chains', () => {
    expect(parseOk('use reports; db.getCollection("x").find({ a: 1 }).pretty();')).toEqual({
      op: 'find',
      filter: { a: 1 }
    });
    expect(parseOk('db.getCollection("find(").find({ a: 1 })')).toEqual({
      op: 'find',
      filter: { a: 1 }
    });
    expect(parseOk('find({ a: 1 }).explain()')).toEqual({ op: 'find', filter: { a: 1 } });
  });

  it('converts ObjectId, ISODate, Date and RegExp to Extended JSON', () => {
    expect(parseOk('find({ _id: ObjectId("6a74885a453f37313482b83c") })')).toEqual({
      op: 'find',
      filter: { _id: { $oid: '6a74885a453f37313482b83c' } }
    });
    expect(parseOk('find({ _id: new ObjectId("6a74885a453f37313482b83c") })')).toEqual({
      op: 'find',
      filter: { _id: { $oid: '6a74885a453f37313482b83c' } }
    });
    expect(parseOk('find({ at: ISODate("2024-01-01T00:00:00Z") })')).toEqual({
      op: 'find',
      filter: { at: { $date: '2024-01-01T00:00:00.000Z' } }
    });
    expect(parseOk('find({ at: new Date("2024-01-01T00:00:00Z") })')).toEqual({
      op: 'find',
      filter: { at: { $date: '2024-01-01T00:00:00.000Z' } }
    });
    expect(parseOk('find({ name: /jo+/i })')).toEqual({
      op: 'find',
      filter: { name: { $regularExpression: { pattern: 'jo+', options: 'i' } } }
    });
  });

  it('accepts Extended JSON literals as written', () => {
    expect(parseOk('find({ at: { "$date": "2024-01-01T00:00:00.000Z" } })')).toEqual({
      op: 'find',
      filter: { at: { $date: '2024-01-01T00:00:00.000Z' } }
    });
    expect(parseOk('find({ _id: { "$oid": "6a74885a453f37313482b83c" } })')).toEqual({
      op: 'find',
      filter: { _id: { $oid: '6a74885a453f37313482b83c' } }
    });
  });

  it('handles comments, trailing commas and semicolons', () => {
    expect(parseOk('// top\nfind({ a: 1, }, /* proj */ { b: 1 });')).toEqual({
      op: 'find',
      filter: { a: 1 },
      projection: { b: 1 }
    });
  });

  it('keeps chained skip and limit as raw numbers for later clamping', () => {
    expect(parseOk('find({}).skip(0).limit(1200)')).toEqual({
      op: 'find',
      filter: {},
      skip: 0,
      limit: 1200
    });
    expect(parseOk('find({}).limit()')).toEqual({ op: 'find', filter: {} });
  });

  it('normalizes empty projection and sort to undefined', () => {
    expect(parseOk('find({}, {})')).toEqual({ op: 'find', filter: {} });
    expect(parseOk('find({}).sort()')).toEqual({ op: 'find', filter: {} });
  });

  it('parses findOne with projection and options sort', () => {
    expect(parseOk('db.getCollection("x").findOne({ a: 1 })')).toEqual({
      op: 'findOne',
      filter: { a: 1 }
    });
    expect(parseOk('findOne({ a: 1 }, { b: 1 })')).toEqual({
      op: 'findOne',
      filter: { a: 1 },
      projection: { b: 1 }
    });
    expect(parseOk('findOne({ a: 1 }, {}, { sort: { _id: -1 } })')).toEqual({
      op: 'findOne',
      filter: { a: 1 },
      sort: { _id: -1 }
    });
  });

  it('parses countDocuments with an optional filter', () => {
    expect(parseOk('countDocuments()')).toEqual({ op: 'countDocuments', filter: {} });
    expect(parseOk('db.getCollection("x").countDocuments({ active: true })')).toEqual({
      op: 'countDocuments',
      filter: { active: true }
    });
    expect(parseErr('countDocuments({}, {})')).toMatch(/countDocuments\(\) usage/);
  });

  it('parses updateOne and updateMany with upsert option', () => {
    expect(parseOk('updateOne({ a: 1 }, { $set: { b: 2 } })')).toEqual({
      op: 'updateOne',
      filter: { a: 1 },
      update: { $set: { b: 2 } },
      upsert: false
    });
    expect(parseOk('updateMany({}, { $inc: { n: 1 } }, { upsert: true })')).toEqual({
      op: 'updateMany',
      filter: {},
      update: { $inc: { n: 1 } },
      upsert: true
    });
  });

  it('rejects updates without operators and missing arguments', () => {
    expect(parseErr('updateOne({ a: 1 }, { b: 2 })')).toMatch(/update operators/);
    expect(parseErr('updateOne({ a: 1 })')).toMatch(/updateOne\(\) usage/);
    expect(parseErr('updateMany({ a: 1 })')).toMatch(/updateMany\(\) usage/);
  });

  it('parses replaceOne and rejects operators in the replacement', () => {
    expect(parseOk('replaceOne({ a: 1 }, { b: 2 }, { upsert: true })')).toEqual({
      op: 'replaceOne',
      filter: { a: 1 },
      replacement: { b: 2 },
      upsert: true
    });
    expect(parseErr('replaceOne({ a: 1 }, { $set: { b: 2 } })')).toMatch(
      /cannot contain update operators/
    );
    expect(parseErr('replaceOne({ a: 1 })')).toMatch(/replaceOne\(\) usage/);
  });

  it('parses deleteOne and deleteMany', () => {
    expect(parseOk('deleteOne({ _id: ObjectId("6a74885a453f37313482b83c") })')).toEqual({
      op: 'deleteOne',
      filter: { _id: { $oid: '6a74885a453f37313482b83c' } }
    });
    expect(parseOk('db.getCollection("x").deleteMany({ expired: true })')).toEqual({
      op: 'deleteMany',
      filter: { expired: true }
    });
    expect(parseErr('deleteMany()')).toMatch(/deleteMany\(\) usage/);
  });

  it('parses insertOne and insertMany', () => {
    expect(parseOk('insertOne({ name: "Ada" })')).toEqual({
      op: 'insertOne',
      document: { name: 'Ada' }
    });
    expect(parseErr('insertOne([1])')).toMatch(/document must be an object/);
    expect(parseErr('insertOne()')).toMatch(/insertOne\(\) usage/);
    expect(parseOk('insertMany([{ a: 1 }, { b: 2 }])')).toEqual({
      op: 'insertMany',
      documents: [{ a: 1 }, { b: 2 }]
    });
    expect(parseErr('insertMany({ a: 1 })')).toMatch(/array of documents/);
    expect(parseErr('insertMany([])')).toMatch(/at least one document/);
  });

  it('parses aggregate pipelines', () => {
    expect(parseOk('aggregate([{ $match: { active: true } }, { $count: "n" }])')).toEqual({
      op: 'aggregate',
      pipeline: [{ $match: { active: true } }, { $count: 'n' }]
    });
    expect(parseErr('aggregate({ $match: {} })')).toMatch(/array pipeline/);
    expect(parseErr('aggregate([])')).toMatch(/at least one stage/);
  });

  it('ignores chains after non-find methods', () => {
    expect(parseOk('deleteMany({ a: 1 }).limit(5)')).toEqual({
      op: 'deleteMany',
      filter: { a: 1 }
    });
  });

  it('reports helpful parse errors', () => {
    expect(parseErr('find({ a: 1')).toMatch(/Unbalanced parentheses in find/);
    expect(parseErr('find({ a: 1 }, { b: 1 }, { c: 1 })')).toMatch(/at most two arguments/);
    expect(parseErr('find("nope")')).toMatch(/filter must be an object/);
    expect(parseErr('find({ a: 1 }).sort("nope")')).toMatch(/sort\(\) argument must be an object/);
    expect(parseErr('find({ a: 1 }).skip("nope")')).toMatch(/skip\(\) argument must be a number/);
    expect(parseErr('find({ a: 1 }).limit("nope")')).toMatch(/limit\(\) argument must be a number/);
    expect(parseErr('{ broken: (')).toMatch(/Invalid query expression|Cannot evaluate/);
    expect(parseErr('5')).toMatch(/Expected a query method/);
  });

  it('rejects unsupported collection methods with a helpful message', () => {
    expect(parseErr('db.getCollection("x").bulkWrite([])')).toMatch(
      /Unsupported method "bulkWrite"/
    );
    expect(parseErr('db.users.drop()')).toMatch(/Supported methods: find, findOne, countDocuments/);
    expect(parseErr('db.getCollection("x")')).toMatch(/No query method after getCollection/);
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL** — `pnpm exec vitest run src/renderer/src/lib/shell-query.test.ts` → FAIL (module has no `parseShellQuery`).

- [ ] **Step 3: Rewrite `src/renderer/src/lib/shell-query.ts`** — complete file:

```ts
import { messageOf } from './errors';

export const QUERY_METHODS = [
  'find',
  'findOne',
  'countDocuments',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'insertOne',
  'insertMany',
  'aggregate'
] as const;

export type QueryMethod = (typeof QUERY_METHODS)[number];

export type ParsedQuery =
  | { op: 'find'; filter: unknown; projection?: unknown; sort?: unknown; skip?: number; limit?: number }
  | { op: 'findOne'; filter: unknown; projection?: unknown; sort?: unknown }
  | { op: 'countDocuments'; filter: unknown }
  | { op: 'updateOne'; filter: unknown; update: unknown; upsert: boolean }
  | { op: 'updateMany'; filter: unknown; update: unknown; upsert: boolean }
  | { op: 'replaceOne'; filter: unknown; replacement: unknown; upsert: boolean }
  | { op: 'deleteOne'; filter: unknown }
  | { op: 'deleteMany'; filter: unknown }
  | { op: 'insertOne'; document: unknown }
  | { op: 'insertMany'; documents: unknown[] }
  | { op: 'aggregate'; pipeline: unknown[] };

export type ShellQueryResult =
  | { ok: true; value: ParsedQuery }
  | { ok: false; message: string };

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[\w$]/.test(ch);
}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function skipString(text: string, i: number): number {
  const quote = text[i];
  i += 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    i += 1;
  }
  return text.length;
}

function skipLineComment(text: string, i: number): number {
  while (i < text.length && text[i] !== '\n') i += 1;
  return i;
}

function skipBlockComment(text: string, i: number): number {
  i += 2;
  while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
  return Math.min(i + 2, text.length);
}

function prevNonSpace(text: string, index: number): string | null {
  let p = index - 1;
  while (p >= 0 && isSpace(text[p])) p -= 1;
  return p >= 0 ? text[p] : null;
}

function findMatchingParen(text: string, openIdx: number): number {
  let depth = 0;
  let i = openIdx;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(text, i);
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      i = skipLineComment(text, i + 2);
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i = skipBlockComment(text, i);
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(text, i);
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      i = skipLineComment(text, i + 2);
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i = skipBlockComment(text, i);
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  parts.push(text.slice(start));
  return parts;
}

function isQueryMethod(ident: string): ident is QueryMethod {
  return (QUERY_METHODS as readonly string[]).includes(ident);
}

interface MethodCall {
  name: QueryMethod;
  openIdx: number;
  closeIdx: number;
}

function findMethodCall(text: string): MethodCall | null {
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(text, i);
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      i = skipLineComment(text, i + 2);
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i = skipBlockComment(text, i);
      continue;
    }
    if (!isIdentStart(ch)) {
      i += 1;
      continue;
    }
    const start = i;
    let j = i;
    while (j < text.length && isIdentPart(text[j])) j += 1;
    const ident = text.slice(start, j);
    if (isQueryMethod(ident)) {
      let k = j;
      while (k < text.length && isSpace(text[k])) k += 1;
      if (text[k] === '(') {
        const closeIdx = findMatchingParen(text, k);
        if (closeIdx === -1) throw new Error(`Unbalanced parentheses in ${ident}()`);
        return { name: ident, openIdx: k, closeIdx };
      }
    }
    i = j;
  }
  return null;
}

function findForeignCall(text: string): string | null {
  let i = 0;
  let depth = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(text, i);
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      i = skipLineComment(text, i + 2);
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i = skipBlockComment(text, i);
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth = Math.max(0, depth - 1);
      i += 1;
      continue;
    }
    if (!isIdentStart(ch)) {
      i += 1;
      continue;
    }
    const start = i;
    let j = i;
    while (j < text.length && isIdentPart(text[j])) j += 1;
    const ident = text.slice(start, j);
    let k = j;
    while (k < text.length && isSpace(text[k])) k += 1;
    if (
      depth === 0 &&
      text[k] === '(' &&
      prevNonSpace(text, start) === '.' &&
      ident !== 'getCollection'
    ) {
      return ident;
    }
    i = j;
  }
  return null;
}

interface ChainArgs {
  sort?: string;
  skip?: string;
  limit?: string;
}

function parseChains(text: string): ChainArgs {
  const chains: ChainArgs = {};
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(text, i);
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      i = skipLineComment(text, i + 2);
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i = skipBlockComment(text, i);
      continue;
    }
    if (!isIdentStart(ch)) {
      i += 1;
      continue;
    }
    const start = i;
    let j = i;
    while (j < text.length && isIdentPart(text[j])) j += 1;
    const ident = text.slice(start, j);
    if (ident !== 'sort' && ident !== 'skip' && ident !== 'limit') {
      i = j;
      continue;
    }
    let k = j;
    while (k < text.length && isSpace(text[k])) k += 1;
    if (text[k] === '(' && prevNonSpace(text, start) === '.') {
      const close = findMatchingParen(text, k);
      if (close === -1) throw new Error(`Unbalanced parentheses in .${ident}()`);
      chains[ident] = text.slice(k + 1, close);
      i = close + 1;
      continue;
    }
    i = j;
  }
  return chains;
}

function normalizeArgs(raw: string[]): string[] {
  if (raw.length === 1 && raw[0].trim() === '') return [];
  return raw;
}

function expectArgs(args: string[], min: number, max: number, usage: string): void {
  if (args.length < min || args.length > max) throw new Error(usage);
}

function objectIdStub(value: unknown): { $oid: string } {
  return { $oid: String(value) };
}

function isoDateStub(value: unknown): { $date: string } {
  const date = new Date(value as string | number);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date in ISODate(...)');
  return { $date: date.toISOString() };
}

function evaluate(expr: string): unknown {
  const src = expr.trim();
  if (src === '') return undefined;
  let factory: (objectId: typeof objectIdStub, isoDate: typeof isoDateStub) => unknown;
  try {
    factory = new Function('ObjectId', 'ISODate', `return (\n${src}\n);`) as typeof factory;
  } catch (err) {
    throw new Error(`Invalid query expression: ${messageOf(err)}`);
  }
  try {
    return factory(objectIdStub, isoDateStub);
  } catch (err) {
    const short = src.length > 80 ? `${src.slice(0, 80)}…` : src;
    throw new Error(`Cannot evaluate \`${short}\`: ${messageOf(err)}`);
  }
}

function toEjson(value: unknown): unknown {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (value instanceof RegExp) {
    return { $regularExpression: { pattern: value.source, options: value.flags } };
  }
  if (Array.isArray(value)) return value.map((item) => toEjson(item));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = toEjson(item);
    return out;
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readObject(expr: string, label: string): Record<string, unknown> | undefined {
  const raw = expr.trim();
  if (raw === '') return undefined;
  const value = toEjson(evaluate(raw));
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) throw new Error(`${label} must be an object`);
  if (Object.keys(value).length === 0) return undefined;
  return value;
}

function readFilter(expr: string): unknown {
  const raw = expr.trim();
  if (raw === '') return {};
  const value = toEjson(evaluate(raw));
  if (value === undefined) return {};
  if (!isPlainObject(value)) throw new Error('query filter must be an object');
  return value;
}

function readNumber(expr: string, label: string): number | undefined {
  const raw = expr.trim();
  if (raw === '') return undefined;
  const value = evaluate(raw);
  const n =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) throw new Error(`.${label}() argument must be a number`);
  return n;
}

function readUpdate(expr: string): unknown {
  const value = readObject(expr, 'update document');
  if (value === undefined) {
    throw new Error('update document is required, e.g. { $set: { field: 1 } }');
  }
  if (!Object.keys(value).some((key) => key.startsWith('$'))) {
    throw new Error(
      'update document must use update operators ($set, $inc, …) — use replaceOne() to replace a whole document'
    );
  }
  return value;
}

function readReplacement(expr: string): unknown {
  const value = readObject(expr, 'replacement');
  if (value === undefined) throw new Error('replacement document is required');
  if (Object.keys(value).some((key) => key.startsWith('$'))) {
    throw new Error(
      'replacement document cannot contain update operators — use updateOne()/updateMany()'
    );
  }
  return value;
}

function readDocument(expr: string): unknown {
  const value = readObject(expr, 'document');
  if (value === undefined) throw new Error('insertOne() requires a document');
  return value;
}

function readDocumentList(expr: string): unknown[] {
  const value = evaluate(expr);
  if (!Array.isArray(value)) throw new Error('insertMany() takes an array of documents');
  if (value.length === 0) throw new Error('insertMany() requires at least one document');
  const out = value.map((item) => toEjson(item));
  if (!out.every((item) => isPlainObject(item))) {
    throw new Error('insertMany() takes an array of documents');
  }
  return out;
}

function readPipeline(expr: string): unknown[] {
  const value = evaluate(expr);
  if (!Array.isArray(value)) {
    throw new Error('aggregate() takes an array pipeline, e.g. [{ $match: { active: true } }]');
  }
  if (value.length === 0) throw new Error('aggregate() pipeline requires at least one stage');
  const out = value.map((item) => toEjson(item));
  if (!out.every((item) => isPlainObject(item))) {
    throw new Error('aggregate() pipeline stages must be objects');
  }
  return out;
}

function readUpsert(args: string[], index: number): boolean {
  if (args.length <= index) return false;
  const options = readObject(args[index], 'options');
  return options !== undefined && options.upsert === true;
}

function parseFilterOnly(source: string): ShellQueryResult {
  try {
    const value = toEjson(evaluate(source));
    if (!isPlainObject(value)) {
      return {
        ok: false,
        message: 'Expected a query method (e.g. db.getCollection("c").find({})) or a filter object'
      };
    }
    return { ok: true, value: { op: 'find', filter: value } };
  } catch (err) {
    return { ok: false, message: messageOf(err) };
  }
}

function buildParsed(name: QueryMethod, args: string[], tail: string): ShellQueryResult {
  switch (name) {
    case 'find': {
      expectArgs(args, 0, 2, 'find() takes at most two arguments: filter and projection');
      const filter = readFilter(args[0] ?? '');
      const projection = args.length > 1 ? readObject(args[1], 'find() projection') : undefined;
      const chains = parseChains(tail);
      const sort =
        chains.sort !== undefined ? readObject(chains.sort, '.sort() argument') : undefined;
      const skip = chains.skip !== undefined ? readNumber(chains.skip, 'skip') : undefined;
      const limit = chains.limit !== undefined ? readNumber(chains.limit, 'limit') : undefined;
      return { ok: true, value: { op: 'find', filter, projection, sort, skip, limit } };
    }
    case 'findOne': {
      expectArgs(args, 0, 3, 'findOne() usage: findOne(filter, projection?, options?)');
      const filter = readFilter(args[0] ?? '');
      const projection = args.length > 1 ? readObject(args[1], 'findOne() projection') : undefined;
      let sort: unknown;
      if (args.length > 2) {
        const options = readObject(args[2], 'findOne() options');
        sort = options === undefined ? undefined : options.sort;
        if (sort !== undefined && !isPlainObject(sort)) {
          throw new Error('findOne() options.sort must be an object');
        }
      }
      return { ok: true, value: { op: 'findOne', filter, projection, sort } };
    }
    case 'countDocuments': {
      expectArgs(args, 0, 1, 'countDocuments() usage: countDocuments(filter?)');
      return { ok: true, value: { op: 'countDocuments', filter: readFilter(args[0] ?? '') } };
    }
    case 'updateOne':
    case 'updateMany': {
      expectArgs(args, 2, 3, `${name}() usage: ${name}(filter, update, options?)`);
      const filter = readFilter(args[0]);
      const update = readUpdate(args[1]);
      const upsert = readUpsert(args, 2);
      return name === 'updateOne'
        ? { ok: true, value: { op: 'updateOne', filter, update, upsert } }
        : { ok: true, value: { op: 'updateMany', filter, update, upsert } };
    }
    case 'replaceOne': {
      expectArgs(args, 2, 3, 'replaceOne() usage: replaceOne(filter, replacement, options?)');
      const filter = readFilter(args[0]);
      const replacement = readReplacement(args[1]);
      const upsert = readUpsert(args, 2);
      return { ok: true, value: { op: 'replaceOne', filter, replacement, upsert } };
    }
    case 'deleteOne':
    case 'deleteMany': {
      expectArgs(args, 1, 1, `${name}() usage: ${name}(filter)`);
      const filter = readFilter(args[0]);
      return name === 'deleteOne'
        ? { ok: true, value: { op: 'deleteOne', filter } }
        : { ok: true, value: { op: 'deleteMany', filter } };
    }
    case 'insertOne': {
      expectArgs(args, 1, 1, 'insertOne() usage: insertOne(document)');
      return { ok: true, value: { op: 'insertOne', document: readDocument(args[0]) } };
    }
    case 'insertMany': {
      expectArgs(args, 1, 1, 'insertMany() usage: insertMany(documents)');
      return { ok: true, value: { op: 'insertMany', documents: readDocumentList(args[0]) } };
    }
    case 'aggregate': {
      expectArgs(args, 1, 1, 'aggregate() usage: aggregate(pipeline)');
      return { ok: true, value: { op: 'aggregate', pipeline: readPipeline(args[0]) } };
    }
    default:
      throw new Error(`Unsupported method "${name as string}"`);
  }
}

export function parseShellQuery(text: string): ShellQueryResult {
  const source = text.trim().replace(/;+\s*$/, '');
  if (source === '') return { ok: true, value: { op: 'find', filter: {} } };
  try {
    const call = findMethodCall(source);
    if (call === null) {
      const foreign = findForeignCall(source);
      if (foreign !== null) {
        return {
          ok: false,
          message: `Unsupported method "${foreign}". Supported methods: ${QUERY_METHODS.join(', ')}`
        };
      }
      if (/getCollection\s*\(/.test(source)) {
        return {
          ok: false,
          message: 'No query method after getCollection() — e.g. db.getCollection("c").find({})'
        };
      }
      return parseFilterOnly(source);
    }
    const args = normalizeArgs(splitTopLevel(source.slice(call.openIdx + 1, call.closeIdx)));
    return buildParsed(call.name, args, source.slice(call.closeIdx + 1));
  } catch (err) {
    return { ok: false, message: messageOf(err) };
  }
}
```

Note: `readObject` returns `Record<string, unknown>` (via the `isPlainObject` guard), so `options.sort` / `options.upsert` property access typechecks.

- [ ] **Step 4: Run tests, verify PASS** — `pnpm exec vitest run src/renderer/src/lib/shell-query.test.ts` → all PASS. (`pnpm typecheck` **fails here by design** — `TabWorkspace` still imports `parseShellFindQuery`; fixed in Task 4.)

- [ ] **Step 5: Commit** — `git add src/renderer/src/lib/shell-query.ts src/renderer/src/lib/shell-query.test.ts && git commit -m "parse all shell query methods in querybar"`

---

## Task 3: Reducer — result card + last-read snapshot (TDD)

**Files:** Test `src/renderer/src/context/reducer.test.ts`; Modify `src/renderer/src/context/reducer.ts`

- [ ] **Step 1: Write the failing test** — append inside `describe('reducer tab actions')`:

```ts
  it('tab/card stores a card, tab/results clears it, and tab/read records the last read text', () => {
    let state = stateWithTabs([makeTab('t1')]);
    expect(state.tabData.t1.card).toBeUndefined();
    expect(state.tabData.t1.lastRead).toBeUndefined();

    state = reducer(state, { type: 'tab/card', tabId: 't1', card: { kind: 'count', count: 7 } });
    expect(state.tabData.t1.card).toEqual({ kind: 'count', count: 7 });

    state = reducer(state, {
      type: 'tab/card',
      tabId: 't1',
      card: {
        kind: 'write',
        op: 'updateMany',
        matched: 3,
        modified: 3,
        deleted: 0,
        inserted: 0,
        insertedId: null
      }
    });
    expect(state.tabData.t1.card).toMatchObject({ kind: 'write', op: 'updateMany', matched: 3 });

    state = reducer(state, {
      type: 'tab/read',
      tabId: 't1',
      text: 'db.getCollection("coll").find({})'
    });
    expect(state.tabData.t1.lastRead).toBe('db.getCollection("coll").find({})');

    const results: FindResult = { documents: [{ a: 1 }], truncated: false };
    state = reducer(state, { type: 'tab/results', tabId: 't1', results });
    expect(state.tabData.t1.findResults).toEqual(results);
    expect(state.tabData.t1.card).toBeUndefined();
    expect(state.tabData.t1.lastRead).toBe('db.getCollection("coll").find({})');
  });

  it('tab/errored keeps the card and lastRead intact', () => {
    let state = stateWithTabs([makeTab('t1')]);
    state = reducer(state, { type: 'tab/card', tabId: 't1', card: { kind: 'count', count: 2 } });
    state = reducer(state, { type: 'tab/read', tabId: 't1', text: 'countDocuments()' });
    state = reducer(state, { type: 'tab/errored', tabId: 't1', error: 'boom' });
    expect(state.tabData.t1.error).toBe('boom');
    expect(state.tabData.t1.card).toEqual({ kind: 'count', count: 2 });
    expect(state.tabData.t1.lastRead).toBe('countDocuments()');
  });
```

- [ ] **Step 2: Run tests, verify FAIL** — `pnpm exec vitest run src/renderer/src/context/reducer.test.ts` → FAIL (actions don't exist).

- [ ] **Step 3: Implement reducer changes** — in `src/renderer/src/context/reducer.ts`:

Add the `ResultCard` export and extend `TabData` (contracts shown above). Extend `AppAction`:

```ts
  | { type: 'tab/results'; tabId: string; results: FindResult }
  | { type: 'tab/card'; tabId: string; card: ResultCard }
  | { type: 'tab/read'; tabId: string; text: string }
  | { type: 'tab/errored'; tabId: string; error: string }
```

Replace the `case 'tab/results'` body and add the two new cases:

```ts
    case 'tab/results': {
      const data = state.tabData[action.tabId];
      if (!data) return state;
      const next: TabData = { ...data, findResults: action.results };
      delete next.card;
      return { ...state, tabData: { ...state.tabData, [action.tabId]: next } };
    }
    case 'tab/card': {
      const data = state.tabData[action.tabId];
      if (!data) return state;
      const next: TabData = { ...data, card: action.card };
      return { ...state, tabData: { ...state.tabData, [action.tabId]: next } };
    }
    case 'tab/read': {
      const data = state.tabData[action.tabId];
      if (!data) return state;
      const next: TabData = { ...data, lastRead: action.text };
      return { ...state, tabData: { ...state.tabData, [action.tabId]: next } };
    }
```

- [ ] **Step 4: Run tests, verify PASS** — `pnpm exec vitest run src/renderer/src/context/reducer.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add src/renderer/src/context/reducer.ts src/renderer/src/context/reducer.test.ts && git commit -m "store result cards and last read per tab"`

---

## Task 4: TabWorkspace dispatch + ResultCard component

**Files:** Create `src/renderer/src/components/ResultCard.tsx`; Modify `src/renderer/src/components/TabWorkspace.tsx`

- [ ] **Step 1: Create `src/renderer/src/components/ResultCard.tsx`** — full file:

```tsx
import type { ResultCard as ResultCardData } from '../context/reducer';

interface ResultCardProps {
  card: ResultCardData;
  onShowResults: (() => void) | null;
}

export default function ResultCard({ card, onShowResults }: ResultCardProps) {
  if (card.kind === 'count') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="rounded-lg border border-slate-200 bg-white px-10 py-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-4xl font-semibold text-slate-900 dark:text-slate-50">
            {card.count.toLocaleString()}
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">documents match</p>
        </div>
      </div>
    );
  }

  const rows: Array<{ label: string; value: number }> = [];
  if (card.op.startsWith('update') || card.op === 'replaceOne') {
    rows.push({ label: 'Matched', value: card.matched });
    rows.push({ label: 'Modified', value: card.modified });
    if (card.inserted > 0) rows.push({ label: 'Upserted', value: card.inserted });
  }
  if (card.op.startsWith('delete')) rows.push({ label: 'Deleted', value: card.deleted });
  if (card.op.startsWith('insert')) rows.push({ label: 'Inserted', value: card.inserted });

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <div className="rounded-lg border border-slate-200 bg-white px-10 py-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
          {card.op}() succeeded
        </p>
        {card.message !== undefined ? (
          <p className="mt-2 max-w-sm text-xs text-slate-500 dark:text-slate-400">{card.message}</p>
        ) : null}
        {rows.length > 0 ? (
          <dl className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
            {rows.map((row) => (
              <div key={row.label} className="flex justify-center gap-4">
                <dt className="text-slate-400 dark:text-slate-500">{row.label}</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-200">
                  {row.value.toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {onShowResults !== null ? (
          <button
            type="button"
            onClick={onShowResults}
            className="mt-4 rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Show results
          </button>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the query-run logic in `TabWorkspace.tsx`** — change imports to:

```tsx
import { parseShellQuery, type ParsedQuery } from '../lib/shell-query';
import ResultCard from './ResultCard';
import type { ResultCard as ResultCardData, TabMeta } from '../context/reducer';
import type { WriteResult } from '../../../shared/ipc';
```

(`TabMeta` already comes from `../context/reducer` on the existing import line — merge into one import.) Add module-level helpers next to `idTarget`:

```tsx
function isReadOp(op: ParsedQuery['op']): boolean {
  return op === 'find' || op === 'findOne' || op === 'countDocuments' || op === 'aggregate';
}

function hasOutputStage(pipeline: unknown[]): boolean {
  return pipeline.some(
    (stage) =>
      stage !== null &&
      typeof stage === 'object' &&
      !Array.isArray(stage) &&
      ('$out' in stage || '$merge' in stage)
  );
}

function writeCard(op: string, result: WriteResult, inserted: number): ResultCardData {
  return {
    kind: 'write',
    op,
    matched: result.matched,
    modified: result.modified,
    deleted: result.deleted,
    inserted,
    insertedId: result.insertedId
  };
}
```

Inside the component, **replace `runFind` entirely** with:

```tsx
  async function runParsed(parsed: ParsedQuery, sourceText: string) {
    if (!data) return;
    dispatch({ type: 'tab/errorCleared', tabId: tab.id });
    dispatch({ type: 'tab/loading', tabId: tab.id, loading: true });
    try {
      switch (parsed.op) {
        case 'find': {
          const skip = Math.max(0, parsed.skip ?? (Number(data.query.skip) || 0));
          const limit = Math.min(
            1000,
            Math.max(1, parsed.limit ?? (Number(data.query.limit) || 50))
          );
          const result = await window.api.executeTab<'find'>(tab.id, {
            kind: 'find',
            database: tab.database,
            collection: tab.collection,
            filter: parsed.filter,
            projection: parsed.projection,
            sort: parsed.sort,
            skip,
            limit
          });
          dispatch({ type: 'tab/results', tabId: tab.id, results: result });
          break;
        }
        case 'findOne': {
          const result = await window.api.executeTab<'find'>(tab.id, {
            kind: 'find',
            database: tab.database,
            collection: tab.collection,
            filter: parsed.filter,
            projection: parsed.projection,
            sort: parsed.sort,
            skip: 0,
            limit: 1
          });
          dispatch({ type: 'tab/results', tabId: tab.id, results: result });
          break;
        }
        case 'countDocuments': {
          const result = await window.api.executeTab<'countDocuments'>(tab.id, {
            kind: 'countDocuments',
            database: tab.database,
            collection: tab.collection,
            filter: parsed.filter
          });
          dispatch({
            type: 'tab/card',
            tabId: tab.id,
            card: { kind: 'count', count: result.count }
          });
          break;
        }
        case 'aggregate': {
          const limit = Math.min(1000, Math.max(1, Number(data.query.limit) || 50));
          const result = await window.api.executeTab<'aggregate'>(tab.id, {
            kind: 'aggregate',
            database: tab.database,
            collection: tab.collection,
            pipeline: parsed.pipeline,
            limit
          });
          if (hasOutputStage(parsed.pipeline)) {
            dispatch({
              type: 'tab/card',
              tabId: tab.id,
              card: {
                kind: 'write',
                op: 'aggregate',
                matched: 0,
                modified: 0,
                deleted: 0,
                inserted: 0,
                insertedId: null,
                message:
                  'Pipeline wrote its output ($out/$merge) — run a find on the target collection to view it.'
              }
            });
          } else {
            dispatch({ type: 'tab/results', tabId: tab.id, results: result });
          }
          break;
        }
        case 'updateOne':
        case 'updateMany': {
          const result = await window.api.executeTab<'updateOne' | 'updateMany'>(tab.id, {
            kind: parsed.op,
            database: tab.database,
            collection: tab.collection,
            filter: parsed.filter,
            update: parsed.update,
            upsert: parsed.upsert
          });
          dispatch({
            type: 'tab/card',
            tabId: tab.id,
            card: writeCard(parsed.op, result, result.insertedId != null ? 1 : 0)
          });
          break;
        }
        case 'replaceOne': {
          const result = await window.api.executeTab<'replaceOne'>(tab.id, {
            kind: 'replaceOne',
            database: tab.database,
            collection: tab.collection,
            target: parsed.filter,
            document: parsed.replacement,
            upsert: parsed.upsert
          });
          dispatch({
            type: 'tab/card',
            tabId: tab.id,
            card: writeCard('replaceOne', result, result.insertedId != null ? 1 : 0)
          });
          break;
        }
        case 'deleteOne': {
          const result = await window.api.executeTab<'deleteOne'>(tab.id, {
            kind: 'deleteOne',
            database: tab.database,
            collection: tab.collection,
            target: parsed.filter
          });
          dispatch({ type: 'tab/card', tabId: tab.id, card: writeCard('deleteOne', result, 0) });
          break;
        }
        case 'deleteMany': {
          const result = await window.api.executeTab<'deleteMany'>(tab.id, {
            kind: 'deleteMany',
            database: tab.database,
            collection: tab.collection,
            filter: parsed.filter
          });
          dispatch({ type: 'tab/card', tabId: tab.id, card: writeCard('deleteMany', result, 0) });
          break;
        }
        case 'insertOne': {
          const result = await window.api.executeTab<'insertOne'>(tab.id, {
            kind: 'insertOne',
            database: tab.database,
            collection: tab.collection,
            document: parsed.document
          });
          dispatch({ type: 'tab/card', tabId: tab.id, card: writeCard('insertOne', result, 1) });
          break;
        }
        case 'insertMany': {
          const result = await window.api.executeTab<'insertMany'>(tab.id, {
            kind: 'insertMany',
            database: tab.database,
            collection: tab.collection,
            documents: parsed.documents
          });
          dispatch({
            type: 'tab/card',
            tabId: tab.id,
            card: writeCard('insertMany', result, parsed.documents.length)
          });
          break;
        }
      }
      const recordsRead =
        isReadOp(parsed.op) && !(parsed.op === 'aggregate' && hasOutputStage(parsed.pipeline));
      if (recordsRead) dispatch({ type: 'tab/read', tabId: tab.id, text: sourceText });
    } catch (err) {
      dispatch({ type: 'tab/errored', tabId: tab.id, error: messageOf(err) });
    } finally {
      dispatch({ type: 'tab/loading', tabId: tab.id, loading: false });
    }
  }

  async function runQuery() {
    if (!data) return;
    const parsed = parseShellQuery(data.query.text);
    if (!parsed.ok) {
      dispatch({
        type: 'tab/errored',
        tabId: tab.id,
        error: `Query failed to parse: ${parsed.message}`
      });
      return;
    }
    await runParsed(parsed.value, data.query.text);
  }

  function refresh() {
    if (!data) return;
    if (data.lastRead !== undefined) {
      const parsed = parseShellQuery(data.lastRead);
      if (parsed.ok && isReadOp(parsed.value.op)) {
        void runParsed(parsed.value, data.lastRead);
        return;
      }
    }
    const parsed = parseShellQuery(data.query.text);
    if (parsed.ok && !isReadOp(parsed.value.op)) return;
    void runQuery();
  }
```

Further edits in the same file:
- `insertDocument` / `replaceDocument` / `deleteDocument`: replace `await runFind();` with `refresh();` (still after the API call, same position).
- Mount effect (`useEffect` on `[tab.id]`): `void runFind();` → `refresh();`.
- `QueryBar` prop: `onRun={() => void runQuery()}`.
- Results area:

```tsx
      <div className="flex min-h-0 flex-1 flex-col p-3">
        {data.card !== undefined ? (
          <ResultCard
            card={data.card}
            onShowResults={data.lastRead !== undefined ? refresh : null}
          />
        ) : (
          <DataTable
            fields={data.fields}
            documents={data.findResults?.documents ?? []}
            truncated={data.findResults?.truncated ?? false}
            loading={data.loading}
            readOnly={false}
            onInsert={() => setInsertText('{}')}
            onEdit={(document) =>
              setEdit({ text: JSON.stringify(document, null, 2), target: idTarget(document) })
            }
            onDelete={(document) => void deleteDocument(idTarget(document))}
          />
        )}
      </div>
```

(`useRef ranRef`, header Refresh button, modals and other effects stay as-is; `runFind` must no longer exist anywhere in the file.)

- [ ] **Step 3: Verify** — `pnpm typecheck` → PASS; `pnpm test` → all PASS.

- [ ] **Step 4: Commit** — `git add src/renderer/src/components/TabWorkspace.tsx src/renderer/src/components/ResultCard.tsx && git commit -m "run multi-method queries from querybar with result card"`

---

## Task 5: Method-name completions in Monaco

**Files:** Modify `src/renderer/src/lib/monaco.ts`

- [ ] **Step 1: Import the method list** — add to the imports:

```ts
import { QUERY_METHODS } from './shell-query';
```

- [ ] **Step 2: Extend the completion provider** — change `triggerCharacters` to `['$', '"', '.']`, and replace the start of the `provideCompletionItems` body so a method position short-circuits:

```ts
      const range = wordRange(model, position);
      const line = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      });
      const inMethodPosition =
        /(?:^|[^A-Za-z0-9_$])(?:db|getCollection\s*\([^)]*\))(?:\s*\.\s*[A-Za-z_$][\w$]*)*\s*\.\s*[A-Za-z_$\w]*$/.test(
          line
        );
      if (inMethodPosition) {
        const methodSuggestions: monaco.languages.CompletionItem[] = QUERY_METHODS.map(
          (method) => ({
            label: method,
            kind: monaco.languages.CompletionItemKind.Method,
            detail: 'Query method',
            insertText: `${method}($0)`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            sortText: `0_${method}`,
            range
          })
        );
        return { suggestions: methodSuggestions };
      }

      const suggestions: monaco.languages.CompletionItem[] = [];
      // … existing stage / operator / field loops unchanged, then `return { suggestions };` …
```

- [ ] **Step 3: Verify** — `pnpm typecheck` → PASS; `pnpm build` → PASS.

- [ ] **Step 4: Commit** — `git add src/renderer/src/lib/monaco.ts && git commit -m "suggest query methods in querybar autocomplete"`

---

## Task 6: Docs + final verification

**Files:** `README.md`, `docs/superpowers/specs/2026-10-09-nexdb-design.md`, `docs/superpowers/plans/2026-10-09-nexdb.md`

- [ ] **Step 1: README.md line 47** — replace the **Query bar** bullet with:

```markdown
- **Query bar** — Monaco editor for shell-style queries: `find`, `findOne`, `countDocuments`, `updateOne`, `updateMany`, `replaceOne`, `deleteOne`, `deleteMany`, `insertOne`, `insertMany`, `aggregate` (under `db.getCollection("c")…`, with `ObjectId`/`ISODate` stubs → Extended JSON), skip/limit inputs, `Cmd/Ctrl+Enter` to run, 1000-row clamp, truncation hinting; count/write results show in a result card, and `Refresh` re-runs the last read.
```

- [ ] **Step 2: Spec `docs/superpowers/specs/2026-10-09-nexdb-design.md`** — three replacements:
  - Line 31 → `| Aggregation / count | Implemented as QueryBar functionality (\`countDocuments\` + \`aggregate\` pipelines from the shell query editor); Monaco \`mongodb\` language + completions kept |`
  - Line 87 → `- QueryBar: Monaco editor for shell-style queries — supported methods: find, findOne, countDocuments, updateOne, updateMany, replaceOne, deleteOne, deleteMany, insertOne, insertMany, aggregate (all under \`db.getCollection("c")…\`; \`ObjectId\`/\`ISODate\`/\`Date\` stubs → Extended JSON; \`find\` supports \`.sort(...).skip(...).limit(...)\` chains) + skip + limit inputs (limit clamped 1..1000; chained \`.skip()\`/\`.limit()\` override the inputs), \`Cmd/Ctrl+Enter\` runs. Count/write results render as a result card; Refresh re-runs the last read, never the current editor text.`
  - Line 92 → `- Exposed via QueryBar: \`countDocuments\` and aggregation pipelines execute from the query editor; document results render in the table, count/write results in a result card. Pipelines with \`$out\`/\`$merge\` run without the \`$limit\` guard, report a result card instead of rows, and are not re-run by Refresh.`

- [ ] **Step 3: Plan doc `docs/superpowers/plans/2026-10-09-nexdb.md`** — append after the existing post-plan update blockquote:

```markdown
> **Post-plan update 2 (2026-10-13):** QueryBar supports `find`, `findOne`, `countDocuments`, `updateOne`, `updateMany`, `replaceOne`, `deleteOne`, `deleteMany`, `insertOne`, `insertMany` and `aggregate` via `parseShellQuery` (`ParsedQuery` union). `TabData` gained `card` (count/write result card) and `lastRead` (last successful read text); new actions `tab/card` and `tab/read`. `Refresh`, tab re-activation and row-CRUD re-run the last read — never the current editor text. New utility kinds: `countDocuments`, `updateOne`, `updateMany`, `deleteMany`, `insertMany`, `aggregate` (`buildPipeline`/`hasOutputStage` clamp with `$limit` unless the pipeline has `$out`/`$merge`).
```

- [ ] **Step 4: Full verification** — `pnpm typecheck && pnpm test && pnpm build` → all PASS (typecheck clean, tests ≥ current 91 + new cases, build succeeds).

- [ ] **Step 5: Manual QA** — `pnpm dev`, open a collection tab, and run each (expect table results for find/findOne/aggregate, cards for countDocuments and every write):
  1. `db.getCollection("x").countDocuments({ active: true })` → count card; `Show results`/`Refresh` re-runs the previous find.
  2. `updateMany({}, { $set: { tagged: true } })` → card `Matched n, Modified n`; editor still holds the update — click **Refresh** and confirm the **find** re-runs (no second update).
  3. `deleteOne({...})`, `deleteMany({...})`, `insertOne({...})`, `insertMany([...])`, `replaceOne(...)` → correct card rows; console free of errors.
  4. `aggregate([{ $match: {} }, { $limit: 10 }])` → table; `aggregate([{ $out: "dest" }])` → message card; Refresh does not re-run it.
  5. After `db.getCollection("x").` press the completion key → method list appears; unknown `db.coll.foo()` → friendly unsupported-method error.
  6. Row CRUD (insert/edit/delete modal) still works and refreshes from `lastRead`.

- [ ] **Step 6: Commit** — `git add README.md docs && git commit -m "update docs for multi-method queries"`

---

## Self-review (writing-plans checklist)

- **Spec coverage:** every requested method has a parse path, an IPC path, and a display path; decisions from all four user answers are encoded (card display, no confirmations, message-after-write, core set only). ✔
- **Placeholders:** none — every step has literal code, commands with expected outcomes, or exact doc strings. ✔
- **Type consistency:** `parseShellQuery`/`ParsedQuery`/`QUERY_METHODS` used identically in Tasks 2/4/5; `tab/card`/`tab/read`/`ResultCard` in Tasks 3/4; `buildPipeline`/`hasOutputStage` in Task 1 tests and implementation; `executeTab<K>` kinds match `UtilityRequest` exactly (`deleteOne`→`target`, `deleteMany`→`filter`, `replaceOne`→`target`+`document`+`upsert`). ✔
- Known sharp edges, intentionally accepted: intermediate typecheck is red between Task 2 and Task 4 (tests stay scoped-green); extra unsupported options args (`insertMany(docs, {ordered:false})`, `aggregate(p, {})`) fail with usage errors (v1 limitation); `findOne` sorts only via its 3rd options arg (no `.sort()` chain).
