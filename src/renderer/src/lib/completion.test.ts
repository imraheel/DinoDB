import { describe, expect, it } from 'vitest';
import { bracketDepth, isBareMethodPosition, methodWordStart, stageSnippet } from './completion';

describe('bracketDepth', () => {
  it('returns 0 for empty and fully closed text', () => {
    expect(bracketDepth('')).toBe(0);
    expect(bracketDepth('db.getCollection("users")')).toBe(0);
    expect(bracketDepth('db.getCollection("a(b)c")')).toBe(0);
    expect(bracketDepth('find({ a: 1 })')).toBe(0);
  });

  it('counts open brackets before the cursor', () => {
    expect(bracketDepth('find(')).toBe(1);
    expect(bracketDepth('find({')).toBe(2);
    expect(bracketDepth('db.getCollection("x").find({')).toBe(2);
  });

  it('ignores brackets inside strings and comments', () => {
    expect(bracketDepth('find("({')).toBe(1);
    expect(bracketDepth("find('a)b'")).toBe(1);
    expect(bracketDepth('find( // (')).toBe(1);
    expect(bracketDepth('/* ( */ find(')).toBe(1);
  });

  it('never goes below zero', () => {
    expect(bracketDepth('})')).toBe(0);
  });
});

describe('methodWordStart', () => {
  it('starts the method word right after a dot', () => {
    expect(methodWordStart('db.users.c', 11)).toBe(10);
    expect(methodWordStart('db.users.', 10)).toBe(10);
    expect(methodWordStart('db.getCollection("u").co', 25)).toBe(23);
  });

  it('covers the whole identifier for bare methods', () => {
    expect(methodWordStart('countDoc', 9)).toBe(1);
    expect(methodWordStart('  countDoc', 11)).toBe(3);
  });

  it('returns the cursor column when there is no method word', () => {
    expect(methodWordStart('', 1)).toBe(1);
    expect(methodWordStart('db.', 4)).toBe(4);
  });
});

describe('isBareMethodPosition', () => {
  it('is true for a method word at statement level', () => {
    expect(isBareMethodPosition('countDoc', 0)).toBe(true);
    expect(isBareMethodPosition('  find', 0)).toBe(true);
    expect(isBareMethodPosition('use db; find', 0)).toBe(true);
  });

  it('is false inside brackets, after a dot, or with open depth', () => {
    expect(isBareMethodPosition('countDoc', 2)).toBe(false);
    expect(isBareMethodPosition('db.users.', 0)).toBe(false);
    expect(isBareMethodPosition('find({ a: ', 2)).toBe(false);
    expect(isBareMethodPosition('', 0)).toBe(false);
  });
});

describe('stageSnippet', () => {
  it('escapes the dollar sign so monaco inserts the literal stage name', () => {
    expect(stageSnippet('$match')).toBe('"\\$match": {\n\t${1}\n}');
  });

  it('keeps the tabstop placeholder for the stage body', () => {
    expect(stageSnippet('$group')).toBe('"\\$group": {\n\t${1}\n}');
  });
});
