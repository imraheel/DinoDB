import type { SchemaField } from '../shared/types';

const MAX_DEPTH = 6;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !('_bsontype' in value)
  );
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (typeof value === 'object' && value !== null && '_bsontype' in value) {
    return String((value as { _bsontype: unknown })._bsontype).toLowerCase();
  }
  return typeof value;
}

function record(seen: Map<string, Set<string>>, path: string, type: string): void {
  const types = seen.get(path);
  if (types) {
    types.add(type);
  } else {
    seen.set(path, new Set([type]));
  }
}

function walk(
  value: Record<string, unknown>,
  prefix: string,
  depth: number,
  seen: Map<string, Set<string>>
): void {
  for (const key of Object.keys(value)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    const child = value[key];
    if (isPlainObject(child)) {
      if (depth + 1 < MAX_DEPTH) {
        walk(child, path, depth + 1, seen);
      } else {
        record(seen, path, 'object');
      }
    } else {
      record(seen, path, typeOf(child));
    }
  }
}

export function inferSchema(docs: Record<string, unknown>[]): SchemaField[] {
  const seen = new Map<string, Set<string>>();
  for (const doc of docs) {
    walk(doc, '', 0, seen);
  }
  return Array.from(seen, ([path, types]) => ({
    path,
    type: Array.from(types)
      .sort()
      .join(' | ')
  }));
}
