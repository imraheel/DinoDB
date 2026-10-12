import type { SchemaField } from '../../../shared/types';

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return JSON.stringify(value);

  const obj = value as Record<string, unknown>;
  if (typeof obj.$oid === 'string') return obj.$oid;

  if ('$date' in obj) {
    const date = obj.$date;
    if (typeof date === 'string' || typeof date === 'number') return new Date(date).toISOString();
  }

  if ('$binary' in obj) {
    const binary = obj.$binary;
    if (typeof binary === 'string') return `Binary(${binary.length} base64 chars)`;
    if (binary !== null && typeof binary === 'object') {
      const base64 = (binary as { base64?: unknown }).base64;
      if (typeof base64 === 'string') return `Binary(${base64.length} base64 chars)`;
    }
  }

  for (const key of ['$numberDecimal', '$numberLong', '$numberInt']) {
    const inner = obj[key];
    if (typeof inner === 'string') return inner;
  }

  return JSON.stringify(value);
}

export function getColumns(fields: SchemaField[], documents: unknown[]): string[] {
  const columns: string[] = [];
  const seen = new Set<string>();

  for (const field of fields) {
    if (field.path.includes('.') || seen.has(field.path)) continue;
    seen.add(field.path);
    columns.push(field.path);
  }

  for (const document of documents) {
    if (document === null || typeof document !== 'object' || Array.isArray(document)) continue;
    for (const key of Object.keys(document)) {
      if (seen.has(key)) continue;
      seen.add(key);
      columns.push(key);
    }
  }

  return columns;
}
