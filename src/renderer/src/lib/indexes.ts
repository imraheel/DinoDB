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
  if (index.unique === true) props.push('unique');
  if (index.sparse === true) props.push('sparse');
  if (index.hidden === true) props.push('hidden');
  if (index.expireAfterSeconds !== undefined) {
    props.push(`expireAfterSeconds=${index.expireAfterSeconds}`);
  }
  if (index.partialFilterExpression !== undefined) props.push('partial');
  return props.length > 0 ? props.join(', ') : '—';
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
