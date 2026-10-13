import { messageOf } from './errors';

export interface ParsedFindQuery {
  filter: unknown;
  projection?: unknown;
  sort?: unknown;
  skip?: number;
  limit?: number;
}

export type ShellQueryResult =
  | { ok: true; value: ParsedFindQuery }
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

function findCallIndex(text: string): number {
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
    if (ident === 'find') {
      let k = j;
      while (k < text.length && isSpace(text[k])) k += 1;
      if (text[k] === '(') return start;
    }
    i = j;
  }
  return -1;
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

function readObject(expr: string, label: string): unknown {
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
  if (!isPlainObject(value)) throw new Error('find() filter must be an object');
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

function parseFilterOnly(source: string): ShellQueryResult {
  if (/\.findOne\s*\(/.test(source)) {
    return { ok: false, message: 'findOne() is not supported — use find() instead' };
  }
  try {
    const value = toEjson(evaluate(source));
    if (!isPlainObject(value)) {
      return { ok: false, message: 'Expected a find(filter, projection) query or a filter object' };
    }
    return { ok: true, value: { filter: value } };
  } catch (err) {
    return { ok: false, message: messageOf(err) };
  }
}

export function parseShellFindQuery(text: string): ShellQueryResult {
  const source = text.trim().replace(/;+\s*$/, '');
  if (source === '') return { ok: true, value: { filter: {} } };
  try {
    const callIdx = findCallIndex(source);
    if (callIdx === -1) return parseFilterOnly(source);
    const openIdx = source.indexOf('(', callIdx);
    const closeIdx = findMatchingParen(source, openIdx);
    if (closeIdx === -1) return { ok: false, message: 'Unbalanced parentheses in find(...)' };
    const args = splitTopLevel(source.slice(openIdx + 1, closeIdx));
    if (args.length > 2) {
      return { ok: false, message: 'find() takes at most two arguments: filter and projection' };
    }
    const filter = readFilter(args[0] ?? '');
    const projection = args.length > 1 ? readObject(args[1], 'find() projection') : undefined;
    const chains = parseChains(source.slice(closeIdx + 1));
    const sort =
      chains.sort !== undefined ? readObject(chains.sort, '.sort() argument') : undefined;
    const skip = chains.skip !== undefined ? readNumber(chains.skip, 'skip') : undefined;
    const limit = chains.limit !== undefined ? readNumber(chains.limit, 'limit') : undefined;
    return { ok: true, value: { filter, projection, sort, skip, limit } };
  } catch (err) {
    return { ok: false, message: messageOf(err) };
  }
}
