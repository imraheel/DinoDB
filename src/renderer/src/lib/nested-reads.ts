import type { UtilityRequest } from '../../../shared/ipc';
import {
  findMatchingParen,
  parseShellQuery,
  parseShellValue,
  queryArgumentRange,
  splitTopLevel
} from './shell-query';

type NestedReadRequest = Extract<UtilityRequest, { kind: 'nestedRead' }>;
type ExecuteNestedRead = (request: NestedReadRequest) => Promise<unknown[]>;

function skipQuoted(text: string, start: number): number {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === '\\') i += 2;
    else if (text[i] === quote) return i + 1;
    else i += 1;
  }
  return i;
}

function skipSpace(text: string, start: number): number {
  let i = start;
  while (/\s/.test(text[i] ?? '')) i += 1;
  return i;
}

function skipRegex(text: string, start: number): number {
  let inClass = false;
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === '\\') i += 2;
    else if (text[i] === '[') {
      inClass = true;
      i += 1;
    } else if (text[i] === ']') {
      inClass = false;
      i += 1;
    } else if (text[i] === '/' && !inClass) {
      i += 1;
      while (/[A-Za-z]/.test(text[i] ?? '')) i += 1;
      return i;
    } else i += 1;
  }
  return i;
}

function identifier(text: string, start: number): { value: string; end: number } | null {
  const match = /^[A-Za-z_$][\w$]*/.exec(text.slice(start));
  return match === null ? null : { value: match[0], end: start + match[0].length };
}

interface ReadCall {
  start: number;
  end: number;
  method: 'distinct' | 'find' | 'aggregate';
  collection: string;
  callText: string;
  args: string;
  argsStart: number;
  argsEnd: number;
}

function readCallAt(text: string, start: number): ReadCall | null {
  let i = skipSpace(text, start + 2);
  if (text[i] !== '.') return null;
  i = skipSpace(text, i + 1);
  const collectionPart = identifier(text, i);
  if (collectionPart === null) return null;
  i = skipSpace(text, collectionPart.end);
  let collection = collectionPart.value;
  if (collection === 'getCollection') {
    if (text[i] !== '(') return null;
    const close = findMatchingParen(text, i);
    if (close < 0) throw new Error('Unbalanced getCollection() in nested read.');
    const value = parseShellValue(text.slice(i + 1, close));
    if (typeof value !== 'string' || value === '') {
      throw new Error('Nested getCollection() requires a collection name string.');
    }
    collection = value;
    i = skipSpace(text, close + 1);
  }
  if (text[i] !== '.') return null;
  i = skipSpace(text, i + 1);
  const methodPart = identifier(text, i);
  if (methodPart === null || !['distinct', 'find', 'aggregate'].includes(methodPart.value))
    return null;
  const method = methodPart.value as ReadCall['method'];
  i = skipSpace(text, methodPart.end);
  if (text[i] !== '(') return null;
  const open = i;
  const close = findMatchingParen(text, open);
  if (close < 0) throw new Error(`Unbalanced ${method}() in nested read.`);
  i = close + 1;
  if (method !== 'distinct') {
    let arrayCall = false;
    while (true) {
      const dot = skipSpace(text, i);
      if (text[dot] !== '.') break;
      const chain = identifier(text, skipSpace(text, dot + 1));
      if (chain === null) break;
      const chainOpen = skipSpace(text, chain.end);
      if (text[chainOpen] !== '(') break;
      const chainClose = findMatchingParen(text, chainOpen);
      if (chainClose < 0) throw new Error(`Unbalanced .${chain.value}() in nested read.`);
      if (chain.value === 'toArray') {
        if (text.slice(chainOpen + 1, chainClose).trim() !== '') {
          throw new Error('.toArray() does not take arguments.');
        }
        i = chainClose + 1;
        arrayCall = true;
        break;
      }
      if (method !== 'find' || !['sort', 'skip', 'limit'].includes(chain.value)) break;
      i = chainClose + 1;
    }
    if (!arrayCall) throw new Error(`Nested ${method}() requires .toArray().`);
  }
  return {
    start,
    end: i,
    method,
    collection,
    callText: text.slice(start, i),
    args: text.slice(open + 1, close),
    argsStart: open + 1 - start,
    argsEnd: close - start
  };
}

function firstReadCall(text: string): ReadCall | null {
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipQuoted(text, i);
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      i = text.indexOf('\n', i + 2);
      if (i < 0) break;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      i = close < 0 ? text.length : close + 2;
      continue;
    }
    if (ch === '/') {
      const before = text.slice(0, i).trimEnd().at(-1);
      if (before === undefined || '=(:,[!&|?'.includes(before)) {
        i = skipRegex(text, i);
        continue;
      }
    }
    if (
      text.slice(i, i + 2) === 'db' &&
      !/[\w$.]/.test(text[i - 1] ?? '') &&
      !/[\w$]/.test(text[i + 2] ?? '')
    ) {
      const call = readCallAt(text, i);
      if (call !== null) return call;
    }
    i += 1;
  }
  return null;
}

function nestedRequest(call: ReadCall, database: string): NestedReadRequest {
  const base = { kind: 'nestedRead' as const, database, collection: call.collection };
  if (call.method === 'distinct') {
    const args = splitTopLevel(call.args);
    if (args.length < 1 || args.length > 2)
      throw new Error('distinct() usage: distinct(field, filter?)');
    const field = parseShellValue(args[0]);
    if (typeof field !== 'string' || field === '')
      throw new Error('distinct() requires a field name string.');
    const filter = args.length > 1 ? parseShellValue(args[1]) : {};
    if (filter === null || typeof filter !== 'object' || Array.isArray(filter)) {
      throw new Error('distinct() filter must be an object.');
    }
    return { ...base, method: 'distinct', field, filter };
  }
  const parsed = parseShellQuery(call.callText);
  if (!parsed.ok) throw new Error(`Nested ${call.method}() failed to parse: ${parsed.message}`);
  if (call.method === 'find' && parsed.value.op === 'find') {
    const { filter, projection, sort, skip, limit } = parsed.value;
    return { ...base, method: 'find', filter, projection, sort, skip, limit };
  }
  if (call.method === 'aggregate' && parsed.value.op === 'aggregate') {
    return { ...base, method: 'aggregate', pipeline: parsed.value.pipeline };
  }
  throw new Error(`Nested ${call.method}() failed to parse.`);
}

async function resolveSegment(
  text: string,
  database: string,
  execute: ExecuteNestedRead
): Promise<string> {
  let source = text;
  for (let count = 0; count < 32; count++) {
    const call = firstReadCall(source);
    if (call === null) return source;
    const resolvedArgs = await resolveSegment(call.args, database, execute);
    const callText =
      call.callText.slice(0, call.argsStart) + resolvedArgs + call.callText.slice(call.argsEnd);
    const resolvedCall = { ...call, callText, args: resolvedArgs };
    const values = await execute(nestedRequest(resolvedCall, database));
    source = source.slice(0, call.start) + JSON.stringify(values) + source.slice(call.end);
  }
  throw new Error('Too many nested reads in one query.');
}

export async function resolveNestedReads(
  source: string,
  database: string,
  execute: ExecuteNestedRead
): Promise<string> {
  if (source.trimStart().startsWith('{')) return resolveSegment(source, database, execute);
  const range = queryArgumentRange(source);
  if (range === null) return resolveSegment(source, database, execute);
  const args = await resolveSegment(source.slice(range.start, range.end), database, execute);
  const tail = await resolveSegment(source.slice(range.end), database, execute);
  return source.slice(0, range.start) + args + tail;
}
