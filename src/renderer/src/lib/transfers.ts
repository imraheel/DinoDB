import type { Dispatch } from 'react';
import type { TransferDirection, TransferSource } from '../../../shared/transfer';
import { assertReadOnlyPipeline } from '../../../shared/transfer';
import type { AppAction, TabMeta } from '../context/reducer';
import type { ParsedQuery } from './shell-query';

export interface ExportRead {
  collection: string;
  source: TransferSource;
}

export function exportRead(parsed: ParsedQuery, defaultCollection: string): ExportRead | undefined {
  const collection = parsed.collection ?? defaultCollection;
  if (parsed.op === 'find' || parsed.op === 'findOne') {
    if (parsed.explain) return undefined;
    return {
      collection,
      source: {
        kind: 'find',
        filter: parsed.filter,
        projection: parsed.projection,
        sort: parsed.sort,
        skip: parsed.op === 'find' ? parsed.skip : undefined,
        limit: parsed.op === 'find' ? parsed.limit : 1
      }
    };
  }
  if (parsed.op === 'aggregate' && !parsed.explain) {
    assertReadOnlyPipeline(parsed.pipeline);
    return { collection, source: { kind: 'aggregate', pipeline: parsed.pipeline } };
  }
  return undefined;
}

export async function openTransfer(
  dispatch: Dispatch<AppAction>,
  context: Pick<TabMeta, 'connectionId' | 'connectionName' | 'database' | 'collection'>,
  direction: TransferDirection,
  source?: TransferSource
): Promise<void> {
  const { tabId } = await window.api.createTab({ ...context, kind: direction, source });
  dispatch({
    type: 'tab/added',
    tab: {
      ...context,
      id: tabId,
      kind: direction,
      transferScope:
        direction === 'import'
          ? 'Import into collection'
          : source?.kind === 'selected'
            ? `${source.documents.length} selected rows`
            : source?.kind === 'find' || source?.kind === 'aggregate'
              ? 'All query results'
              : 'Entire collection',
      title: `${context.collection} — ${direction === 'import' ? 'Import' : 'Export'}`
    },
    fields: []
  });
}
