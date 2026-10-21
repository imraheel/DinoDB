import type { CollectionIndexInfo } from '../../../shared/ipc';

function typeOfKeyPart(value: unknown): string {
  if (value === 1) return 'ascending';
  if (value === -1) return 'descending';
  if (value === 'text') return 'text';
  if (value === '2dsphere') return '2dsphere';
  if (value === 'hashed') return 'hashed';
  if (value === 'geoHaystack') return 'geoHaystack';
  if (typeof value === 'string') return value;
  return 'unknown';
}

export function indexTypeLabel(key: Record<string, unknown>): string {
  return Object.values(key).map(typeOfKeyPart).join(', ');
}

export function indexProperties(index: CollectionIndexInfo): string {
  const props: string[] = [];
  props.push(Object.keys(index.key).length > 1 ? 'Compound' : 'Single');
  if (index.unique === true) props.push('Unique');
  if (index.sparse === true) props.push('Sparse');
  if (index.hidden === true) props.push('Hidden');
  if (index.expireAfterSeconds !== undefined) {
    props.push(`TTL (${index.expireAfterSeconds}s)`);
  }
  if (index.partialFilterExpression !== undefined) props.push('Partial');
  return props.join(', ');
}

export function formatIndexSize(bytes: number | undefined): string {
  if (bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatIndexUsage(count: number | undefined): string {
  if (count === undefined) return '—';
  return count.toLocaleString('en-US');
}

export function indexUsageLabel(count: number | undefined, since?: string): string {
  if (count === undefined) return '—';
  const base = formatIndexUsage(count);
  const sinceLabel =
    since !== undefined && since.length >= 10 ? ` since ${since.slice(0, 10)}` : '';
  return `${base}${sinceLabel}`;
}
