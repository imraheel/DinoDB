import { BSONRegExp, ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { buildFindOptions, fromWire, toWire } from './operations';

describe('toWire / fromWire', () => {
  it('roundtrips ObjectId and Date values', () => {
    const id = new ObjectId('65f000000000000000000001');
    const when = new Date('2024-05-06T07:08:09.123Z');
    const wire = toWire({ _id: id, when });
    expect(wire).toEqual({
      _id: { $oid: '65f000000000000000000001' },
      when: { $date: '2024-05-06T07:08:09.123Z' }
    });
    const back = fromWire(wire) as { _id: ObjectId; when: Date };
    expect(back._id).toBeInstanceOf(ObjectId);
    expect(back._id.toHexString()).toBe('65f000000000000000000001');
    expect(back.when).toBeInstanceOf(Date);
    expect(back.when).toEqual(when);
  });

  it('passes $gt, $match, and $regex through serialization untouched', () => {
    const filter = {
      age: { $gt: 21 },
      name: { $regex: '^A', $options: 'i' },
      $match: { active: true }
    };
    const wire = toWire(filter);
    expect(wire).toEqual({
      age: { $gt: 21 },
      name: { $regex: '^A', $options: 'i' },
      $match: { active: true }
    });
    const back = fromWire(wire) as {
      age: { $gt: number };
      name: BSONRegExp;
      $match: { active: boolean };
    };
    expect(back.age).toEqual({ $gt: 21 });
    expect(back.$match).toEqual({ active: true });
    expect(back.name).toBeInstanceOf(BSONRegExp);
    expect(back.name.pattern).toBe('^A');
    expect(back.name.options).toBe('i');
  });
});

describe('buildFindOptions', () => {
  it('clamps the limit between 1 and 1000', () => {
    expect(buildFindOptions({ limit: 0 })).toEqual({ limit: 1 });
    expect(buildFindOptions({ limit: 99999 })).toEqual({ limit: 1000 });
    expect(buildFindOptions({ limit: 50 })).toEqual({ limit: 50 });
  });

  it('includes projection and sort only when provided', () => {
    expect(buildFindOptions({ limit: 10 })).toEqual({ limit: 10 });
    expect(buildFindOptions({ limit: 10, projection: { name: 1 }, sort: { name: -1 } })).toEqual({
      limit: 10,
      projection: { name: 1 },
      sort: { name: -1 }
    });
  });

  it('deserializes projection and sort through fromWire', () => {
    const options = buildFindOptions({
      limit: 10,
      projection: { ref: { $oid: '65f000000000000000000001' } }
    });
    expect(options.projection).toEqual({ ref: expect.any(ObjectId) });
  });

  it('includes skip only when greater than 0', () => {
    expect(buildFindOptions({ limit: 10, skip: 0 })).toEqual({ limit: 10 });
    expect(buildFindOptions({ limit: 10, skip: 7 })).toEqual({ limit: 10, skip: 7 });
  });
});
