import { describe, expect, it } from 'vitest';
import { pageSkip, lastPageSkip } from './pagination';

describe('pageSkip', () => {
  it('first always returns 0', () => {
    expect(pageSkip('first', 150, 50)).toBe(0);
  });
  it('prev subtracts a page and clamps at 0', () => {
    expect(pageSkip('prev', 150, 50)).toBe(100);
    expect(pageSkip('prev', 20, 50)).toBe(0);
    expect(pageSkip('prev', 0, 50)).toBe(0);
  });
  it('next adds a page', () => {
    expect(pageSkip('next', 0, 50)).toBe(50);
    expect(pageSkip('next', 150, 50)).toBe(200);
  });
});

describe('lastPageSkip', () => {
  it('returns 0 for empty results', () => {
    expect(lastPageSkip(0, 50)).toBe(0);
  });
  it('returns the start of the final partial page', () => {
    expect(lastPageSkip(120, 50)).toBe(100);
    expect(lastPageSkip(100, 50)).toBe(50);
    expect(lastPageSkip(50, 50)).toBe(0);
    expect(lastPageSkip(1, 50)).toBe(0);
  });
});
