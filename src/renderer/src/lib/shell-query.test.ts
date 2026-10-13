import { describe, expect, it } from 'vitest';
import { parseShellFindQuery } from './shell-query';

function parseOk(text: string) {
  const result = parseShellFindQuery(text);
  if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
  return result.value;
}

function parseErr(text: string): string {
  const result = parseShellFindQuery(text);
  if (result.ok) throw new Error('expected a parse failure');
  return result.message;
}

describe('parseShellFindQuery', () => {
  it('treats empty text as a match-all filter', () => {
    expect(parseOk('')).toEqual({ filter: {} });
    expect(parseOk('   \n  ')).toEqual({ filter: {} });
  });

  it('parses the default seeded query text', () => {
    expect(parseOk('db.getCollection("coll").find({\n  \n})')).toEqual({ filter: {} });
  });

  it('accepts a bare filter object without find()', () => {
    expect(parseOk('{ active: true, name: "Ada" }')).toEqual({
      filter: { active: true, name: 'Ada' }
    });
    expect(parseOk('{"active": true}')).toEqual({ filter: { active: true } });
  });

  it('parses find(filter) and find(filter, projection)', () => {
    expect(parseOk('find()')).toEqual({ filter: {} });
    expect(parseOk('find({})')).toEqual({ filter: {} });
    expect(parseOk('find({ a: 1 }, { b: 1 })')).toEqual({
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
      filter: { companyId: { $oid: '6a74885a453f37313482b83c' }, leadPhones: '9196711989' },
      projection: { leadPhones: 1 },
      sort: { _id: -1 },
      skip: 10,
      limit: 5
    });
  });

  it('ignores leading statements, string lookalikes and unknown chains', () => {
    expect(parseOk('use reports; db.getCollection("x").find({ a: 1 }).pretty();')).toEqual({
      filter: { a: 1 }
    });
    expect(parseOk('db.getCollection("find(").find({ a: 1 })')).toEqual({ filter: { a: 1 } });
    expect(parseOk('find({ a: 1 }).explain()')).toEqual({ filter: { a: 1 } });
  });

  it('converts ObjectId, ISODate, Date and RegExp to Extended JSON', () => {
    expect(parseOk('find({ _id: ObjectId("6a74885a453f37313482b83c") })')).toEqual({
      filter: { _id: { $oid: '6a74885a453f37313482b83c' } }
    });
    expect(parseOk('find({ _id: new ObjectId("6a74885a453f37313482b83c") })')).toEqual({
      filter: { _id: { $oid: '6a74885a453f37313482b83c' } }
    });
    expect(parseOk('find({ at: ISODate("2024-01-01T00:00:00Z") })')).toEqual({
      filter: { at: { $date: '2024-01-01T00:00:00.000Z' } }
    });
    expect(parseOk('find({ at: new Date("2024-01-01T00:00:00Z") })')).toEqual({
      filter: { at: { $date: '2024-01-01T00:00:00.000Z' } }
    });
    expect(parseOk('find({ name: /jo+/i })')).toEqual({
      filter: { name: { $regularExpression: { pattern: 'jo+', options: 'i' } } }
    });
  });

  it('accepts Extended JSON literals as written', () => {
    expect(parseOk('find({ at: { "$date": "2024-01-01T00:00:00.000Z" } })')).toEqual({
      filter: { at: { $date: '2024-01-01T00:00:00.000Z' } }
    });
    expect(parseOk('find({ _id: { "$oid": "6a74885a453f37313482b83c" } })')).toEqual({
      filter: { _id: { $oid: '6a74885a453f37313482b83c' } }
    });
  });

  it('handles comments, trailing commas and semicolons', () => {
    expect(parseOk('// top\nfind({ a: 1, }, /* proj */ { b: 1 });')).toEqual({
      filter: { a: 1 },
      projection: { b: 1 }
    });
  });

  it('keeps chained skip and limit as raw numbers for later clamping', () => {
    expect(parseOk('find({}).skip(0).limit(1200)')).toEqual({
      filter: {},
      skip: 0,
      limit: 1200
    });
    expect(parseOk('find({}).limit()')).toEqual({ filter: {} });
  });

  it('normalizes empty projection and sort to undefined', () => {
    expect(parseOk('find({}, {})')).toEqual({ filter: {} });
    expect(parseOk('find({}).sort()')).toEqual({ filter: {} });
  });

  it('reports helpful parse errors', () => {
    expect(parseErr('find({ a: 1')).toMatch(/Unbalanced parentheses in find/);
    expect(parseErr('find({ a: 1 }, { b: 1 }, { c: 1 })')).toMatch(/at most two arguments/);
    expect(parseErr('find("nope")')).toMatch(/filter must be an object/);
    expect(parseErr('find({ a: 1 }).sort("nope")')).toMatch(/sort\(\) argument must be an object/);
    expect(parseErr('find({ a: 1 }).skip("nope")')).toMatch(/skip\(\) argument must be a number/);
    expect(parseErr('find({ a: 1 }).limit("nope")')).toMatch(/limit\(\) argument must be a number/);
    expect(parseErr('db.getCollection("x").findOne({ a: 1 })')).toMatch(
      /findOne\(\) is not supported/
    );
    expect(parseErr('{ broken: (')).toMatch(/Invalid query expression|Cannot evaluate/);
    expect(parseErr('5')).toMatch(/Expected a find/);
  });
});
