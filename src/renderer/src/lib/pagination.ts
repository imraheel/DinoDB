export type PageAction = 'first' | 'prev' | 'next';

export function pageSkip(action: PageAction, currentSkip: number, pageSize: number): number {
  if (action === 'first') return 0;
  if (action === 'prev') return Math.max(0, currentSkip - pageSize);
  return currentSkip + pageSize;
}

export function lastPageSkip(totalCount: number, pageSize: number): number {
  if (totalCount <= 0) return 0;
  return Math.max(0, (Math.ceil(totalCount / pageSize) - 1) * pageSize);
}
