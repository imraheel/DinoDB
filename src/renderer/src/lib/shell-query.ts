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
  'aggregate',
  'createIndex'
] as const;

export type QueryMethod = (typeof QUERY_METHODS)[number];

interface QueryBase {
  collection?: string;
}

export type ParsedQuery =
  | (QueryBase & {
      op: 'find';
      filter: unknown;
      projection?: unknown;
      sort?: unknown;
      skip?: number;
      limit?: number;
      explain?: boolean;
    })
  | (QueryBase & {
      op: 'findOne';
      filter: unknown;
      projection?: unknown;
      sort?: unknown;
      explain?: boolean;
    })
  | (QueryBase & { op: 'countDocuments'; filter: unknown })
  | (QueryBase & { op: 'updateOne'; filter: unknown; update: unknown; upsert: boolean })
  | (QueryBase & { op: 'updateMany'; filter: unknown; update: unknown; upsert: boolean })
  | (QueryBase & {
      op: 'replaceOne';
      filter: unknown;
      replacement: unknown;
      upsert: boolean;
    })
  | (QueryBase & { op: 'deleteOne'; filter: unknown })
  | (QueryBase & { op: 'deleteMany'; filter: unknown })
  | (QueryBase & { op: 'insertOne'; document: unknown })
  | (QueryBase & { op: 'insertMany'; documents: unknown[] })
  | (QueryBase & { op: 'aggregate'; pipeline: unknown[]; explain?: boolean })
  | (QueryBase & {
      op: 'createIndex';
      key: Record<string, unknown>;
      options?: Record<string, unknown>;
    });

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
  identStart: number;
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
        return { name: ident, identStart: start, openIdx: k, closeIdx };
      }
    }
    i = j;
  }
  return null;
}

function extractCollection(prefix: string): string | undefined {
  const trimmed = prefix.trim().replace(/\.+$/, '');
  if (trimmed === '') return undefined;
  const getter = trimmed.match(/(?:^|[^A-Za-z0-9_$])getCollection\s*\(\s*(['"`])([^'"`]+)\1\s*\)$/);
  if (getter !== null) return getter[2];
  const dotted = trimmed.match(/^db\.([A-Za-z_$][\w$]*)$/);
  if (dotted !== null) return dotted[1];
  return undefined;
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
  explain: boolean;
}

function parseChains(text: string): ChainArgs {
  const chains: ChainArgs = { explain: false };
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
    if (ident !== 'sort' && ident !== 'skip' && ident !== 'limit' && ident !== 'explain') {
      i = j;
      continue;
    }
    let k = j;
    while (k < text.length && isSpace(text[k])) k += 1;
    if (text[k] === '(' && prevNonSpace(text, start) === '.') {
      const close = findMatchingParen(text, k);
      if (close === -1) throw new Error(`Unbalanced parentheses in .${ident}()`);
      if (ident === 'explain') {
        chains.explain = true;
      } else {
        chains[ident] = text.slice(k + 1, close);
      }
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
      return {
        ok: true,
        value: {
          op: 'find',
          filter,
          projection,
          sort,
          skip,
          limit,
          ...(chains.explain ? { explain: true } : {})
        }
      };
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
      const chains = parseChains(tail);
      return {
        ok: true,
        value: {
          op: 'findOne',
          filter,
          projection,
          sort,
          ...(chains.explain ? { explain: true } : {})
        }
      };
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
    case 'createIndex': {
      expectArgs(args, 1, 2, 'createIndex() usage: createIndex(key, options?)');
      const key = readObject(args[0], 'createIndex() key');
      if (key === undefined) {
        throw new Error(
          'createIndex() requires a key pattern, e.g. createIndex({ companyId: 1 })'
        );
      }
      const options = args.length > 1 ? readObject(args[1], 'createIndex() options') : undefined;
      return {
        ok: true,
        value: { op: 'createIndex', key, ...(options !== undefined ? { options } : {}) }
      };
    }
    case 'aggregate': {
      expectArgs(args, 1, 1, 'aggregate() usage: aggregate(pipeline)');
      const chains = parseChains(tail);
      return {
        ok: true,
        value: {
          op: 'aggregate',
          pipeline: readPipeline(args[0]),
          ...(chains.explain ? { explain: true } : {})
        }
      };
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
    const collection = extractCollection(source.slice(0, call.identStart));
    const args = normalizeArgs(splitTopLevel(source.slice(call.openIdx + 1, call.closeIdx)));
    const built = buildParsed(call.name, args, source.slice(call.closeIdx + 1));
    if (!built.ok) return built;
    return {
      ok: true,
      value: collection !== undefined ? { ...built.value, collection } : built.value
    };
  } catch (err) {
    return { ok: false, message: messageOf(err) };
  }
}

export interface QuerySegment {
  text: string;
  start: number;
  end: number;
}

export function splitQueries(text: string): QuerySegment[] {
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') lineStarts.push(i + 1);
  }

  const depthAtLineStart = new Map<number, number>();
  let depth = 0;
  let lineIndex = 0;
  let i = 0;
  while (i < text.length) {
    while (lineIndex < lineStarts.length && lineStarts[lineIndex] === i) {
      depthAtLineStart.set(lineStarts[lineIndex], depth);
      lineIndex += 1;
    }
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
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    i += 1;
  }
  while (lineIndex < lineStarts.length) {
    depthAtLineStart.set(lineStarts[lineIndex], depth);
    lineIndex += 1;
  }

  const dbCutIndexes: number[] = [];
  for (let k = 1; k < lineStarts.length; k++) {
    const lineStart = lineStarts[k];
    if ((depthAtLineStart.get(lineStart) ?? 0) !== 0) continue;
    const lineEnd = text.indexOf('\n', lineStart);
    const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
    if (/^\s*db\b/.test(line)) dbCutIndexes.push(k);
  }

  const cutPoints: number[] = [0];
  for (const cutIndex of dbCutIndexes) {
    let index = cutIndex;
    while (index > 0) {
      const prevStart = lineStarts[index - 1];
      const prevEnd = lineStarts[index] - 1;
      const prevLine = text.slice(prevStart, Math.max(prevStart, prevEnd));
      if (/^\s*use\b/.test(prevLine)) index -= 1;
      else break;
    }
    const cutStart = lineStarts[index];
    if (cutStart > cutPoints[cutPoints.length - 1]) cutPoints.push(cutStart);
  }

  const segments: QuerySegment[] = [];
  for (let k = 0; k < cutPoints.length; k++) {
    const rawStart = cutPoints[k];
    const rawEnd = k + 1 < cutPoints.length ? cutPoints[k + 1] : text.length;
    let start = rawStart;
    let end = rawEnd;
    while (start < end && /\s/.test(text[start])) start += 1;
    while (end > start && /\s/.test(text[end - 1])) end -= 1;
    if (end > start) segments.push({ text: text.slice(start, end), start, end });
  }
  return segments;
}

export function queryAtOffset(text: string, offset: number): QuerySegment | null {
  const segments = splitQueries(text);
  if (segments.length === 0) return null;
  for (const segment of segments) {
    if (offset >= segment.start && offset <= segment.end) return segment;
  }
  let before: QuerySegment | null = null;
  for (const segment of segments) {
    if (segment.end <= offset) before = segment;
  }
  return before ?? segments[0];
}
