import { describe, expect, it } from 'vitest';
import { parseShellQuery, queryAtOffset, splitQueries } from './shell-query';

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
      filter: {},
      collection: 'coll'
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
      limit: 5,
      collection: 'crm_leads'
    });
  });

  it('ignores leading statements, string lookalikes and unknown chains', () => {
    expect(parseOk('use reports; db.getCollection("x").find({ a: 1 }).pretty();')).toEqual({
      op: 'find',
      filter: { a: 1 },
      collection: 'x'
    });
    expect(parseOk('db.getCollection("find(").find({ a: 1 })')).toEqual({
      op: 'find',
      filter: { a: 1 },
      collection: 'find('
    });
    expect(parseOk('find({ a: 1 }).explain()')).toEqual({
      op: 'find',
      filter: { a: 1 },
      explain: true
    });
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

  it('sets the explain flag for find, findOne and aggregate with .explain()', () => {
    expect(parseOk('find({ a: 1 }).explain()')).toEqual({
      op: 'find',
      filter: { a: 1 },
      explain: true
    });
    expect(parseOk('find({ a: 1 }).sort({ b: 1 }).skip(5).limit(10).explain()')).toEqual({
      op: 'find',
      filter: { a: 1 },
      sort: { b: 1 },
      skip: 5,
      limit: 10,
      explain: true
    });
    expect(parseOk('db.getCollection("users").find({}).explain()')).toEqual({
      op: 'find',
      filter: {},
      collection: 'users',
      explain: true
    });
    expect(parseOk('findOne({ a: 1 }).explain()')).toEqual({
      op: 'findOne',
      filter: { a: 1 },
      explain: true
    });
    expect(parseOk('aggregate([{ $match: { a: 1 } }]).explain()')).toEqual({
      op: 'aggregate',
      pipeline: [{ $match: { a: 1 } }],
      explain: true
    });
    expect(parseOk('aggregate([{ $match: {} }]).explain("executionStats")')).toEqual({
      op: 'aggregate',
      pipeline: [{ $match: {} }],
      explain: true
    });
  });

  it('does not set the explain flag without .explain() or on non-read ops', () => {
    expect(parseOk('find({ a: 1 })')).toEqual({ op: 'find', filter: { a: 1 } });
    expect(parseOk('countDocuments({ a: 1 }).explain()')).toEqual({
      op: 'countDocuments',
      filter: { a: 1 }
    });
    expect(parseOk('updateMany({}, { $set: { a: 1 } }).explain()')).toEqual({
      op: 'updateMany',
      filter: {},
      update: { $set: { a: 1 } },
      upsert: false
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
      filter: { a: 1 },
      collection: 'x'
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
      filter: { active: true },
      collection: 'x'
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
      filter: { expired: true },
      collection: 'x'
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

  it('parses createIndex with a key and optional options', () => {
    expect(parseOk("db.getCollection('crm_leads').createIndex( { \"companyId\": 1 } )")).toEqual({
      op: 'createIndex',
      key: { companyId: 1 },
      collection: 'crm_leads'
    });
    expect(
      parseOk("db.crm_leads.createIndex({ companyId: 1, externalId: 1 }, { unique: true, name: 'company_external' })")
    ).toEqual({
      op: 'createIndex',
      key: { companyId: 1, externalId: 1 },
      options: { unique: true, name: 'company_external' },
      collection: 'crm_leads'
    });
    expect(parseOk('createIndex({ score: "text" })')).toEqual({
      op: 'createIndex',
      key: { score: 'text' }
    });
    expect(parseErr('createIndex()')).toMatch(/createIndex\(\) usage/);
    expect(parseErr('createIndex({})')).toMatch(/requires a key pattern/);
    expect(parseErr('createIndex("nope")')).toMatch(/key must be an object/);
    expect(parseErr('createIndex({ a: 1 }, "nope")')).toMatch(/options must be an object/);
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

  it('extracts the collection from getCollection() and db.<name> prefixes', () => {
    expect(parseOk('db.getCollection("department").find({})')).toEqual({
      op: 'find',
      filter: {},
      collection: 'department'
    });
    expect(parseOk("db.getCollection('department').countDocuments()")).toEqual({
      op: 'countDocuments',
      filter: {},
      collection: 'department'
    });
    expect(parseOk('db.department.find({ active: true })')).toEqual({
      op: 'find',
      filter: { active: true },
      collection: 'department'
    });
    expect(parseOk('db.department.updateMany({}, { $set: { a: 1 } })')).toEqual({
      op: 'updateMany',
      filter: {},
      update: { $set: { a: 1 } },
      upsert: false,
      collection: 'department'
    });
    expect(parseOk('find({})')).toEqual({ op: 'find', filter: {} });
  });
});

describe('splitQueries', () => {
  const script = `db.getCollection("users").find({ email: 'test@agent.com' })

db.getCollection("users").find({
  email: 'demo@company.com'
})`;

  it('splits on top-level lines starting with db.', () => {
    const segments = splitQueries(script);
    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe(`db.getCollection("users").find({ email: 'test@agent.com' })`);
    expect(segments[1].text).toBe(`db.getCollection("users").find({\n  email: 'demo@company.com'\n})`);
    expect(script.slice(segments[0].start, segments[0].end)).toBe(segments[0].text);
    expect(script.slice(segments[1].start, segments[1].end)).toBe(segments[1].text);
  });

  it('does not split on db. inside strings, comments or nested braces', () => {
    const text = `db.getCollection("users").find({
  note: "see db.orders later",
  // db.internal note
  nested: { db: 1 }
})`;
    expect(splitQueries(text)).toHaveLength(1);
  });

  it('returns one segment for a single query or bare filter', () => {
    expect(splitQueries('db.getCollection("users").find({})')).toHaveLength(1);
    expect(splitQueries('find({ a: 1 })')).toHaveLength(1);
    expect(splitQueries('{ a: 1 }')).toHaveLength(1);
    expect(splitQueries('   ')).toHaveLength(0);
  });

  it('keeps use statements attached to the surrounding segment', () => {
    const text = `use reports
db.getCollection("x").find({})`;
    expect(splitQueries(text)).toHaveLength(1);
  });
});

describe('queryAtOffset', () => {
  const first = `db.getCollection("users").find({ a: 1 })`;
  const second = `db.getCollection("users").find({ b: 2 })`;
  const script = `${first}\n\n${second}`;

  it('returns the segment containing the offset', () => {
    expect(queryAtOffset(script, 5)?.text).toBe(first);
    const secondStart = script.indexOf(second);
    expect(queryAtOffset(script, secondStart + 4)?.text).toBe(second);
  });

  it('picks the previous segment when the offset is in the gap between queries', () => {
    const gap = first.length + 1;
    expect(queryAtOffset(script, gap)?.text).toBe(first);
  });

  it('returns the first segment before all text and handles a single query', () => {
    expect(queryAtOffset(script, 0)?.text).toBe(first);
    expect(queryAtOffset(first, 10)?.text).toBe(first);
    expect(queryAtOffset('', 0)).toBeNull();
  });
});
