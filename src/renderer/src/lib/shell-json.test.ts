import { describe, expect, it } from 'vitest';
import { parseShellJson, toShellJson } from './shell-json';

describe('toShellJson', () => {
  it('renders $oid as ObjectId("...")', () => {
    const text = toShellJson({ _id: { $oid: '6a2acd4c42ca5c17d86386b6' } });
    expect(text).toContain('"_id": ObjectId("6a2acd4c42ca5c17d86386b6")');
    expect(text).not.toContain('$oid');
  });

  it('renders nested and array object ids', () => {
    const text = toShellJson({ items: [{ id: { $oid: 'abc123' } }] });
    expect(text).toContain('ObjectId("abc123")');
  });

  it('leaves other values untouched', () => {
    const text = toShellJson({ name: 'a', n: 1, nested: { $date: '2020-01-01T00:00:00Z' } });
    expect(text).toContain('"name": "a"');
    expect(text).toContain('"n": 1');
    expect(text).toContain('"$date"');
  });
});

describe('parseShellJson', () => {
  it('parses ObjectId("...") back to $oid', () => {
    const parsed = parseShellJson('{\n  "_id": ObjectId("6a2acd4c42ca5c17d86386b6")\n}');
    expect(parsed).toEqual({ _id: { $oid: '6a2acd4c42ca5c17d86386b6' } });
  });

  it('round-trips through toShellJson', () => {
    const doc = { _id: { $oid: '6a2acd4c42ca5c17d86386b6' }, count: 3 };
    expect(parseShellJson(toShellJson(doc))).toEqual(doc);
  });

  it('still parses plain JSON', () => {
    expect(parseShellJson('{ "a": 1 }')).toEqual({ a: 1 });
  });
});
