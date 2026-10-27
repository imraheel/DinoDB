import type { Dispatch } from 'react';
import type { AppAction, TabMeta } from '../context/reducer';
import type { DatabaseTransferKind } from '../../../shared/database-transfer';
export async function openDatabaseTransfer(
  dispatch: Dispatch<AppAction>,
  context: Pick<TabMeta, 'connectionId' | 'connectionName' | 'database'>,
  kind: DatabaseTransferKind
): Promise<void> {
  const id = await window.api.createDatabaseTransfer({
    kind,
    connectionId: context.connectionId,
    database: context.database
  });
  dispatch({
    type: 'tab/added',
    tab: {
      ...context,
      id,
      collection: '',
      kind,
      title: `${context.database} — ${kind === 'database-backup' ? 'Backup' : 'Restore'}`
    },
    fields: []
  });
}
