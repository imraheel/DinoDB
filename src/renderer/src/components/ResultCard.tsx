import type { ResultCard as ResultCardData } from '../context/reducer';

interface ResultCardProps {
  card: ResultCardData;
  onShowResults: (() => void) | null;
}

function rowsOf(card: ResultCardData): Array<{ label: string; value: number }> {
  if (card.kind === 'count') {
    return [{ label: 'count', value: card.count }];
  }
  const rows: Array<{ label: string; value: number }> = [];
  if (card.op.startsWith('update') || card.op === 'replaceOne') {
    rows.push({ label: 'matched', value: card.matched });
    rows.push({ label: 'modified', value: card.modified });
    if (card.inserted > 0) rows.push({ label: 'upserted', value: card.inserted });
  }
  if (card.op.startsWith('delete')) rows.push({ label: 'deleted', value: card.deleted });
  if (card.op.startsWith('insert')) rows.push({ label: 'inserted', value: card.inserted });
  return rows;
}

function titleOf(card: ResultCardData): string {
  return card.kind === 'count' ? 'countDocuments' : `${card.op}()`;
}

export default function ResultCard({ card, onShowResults }: ResultCardProps) {
  const rows = rowsOf(card);
  const message = card.kind === 'write' ? card.message : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 pb-1.5">
        <span className="text-xs text-slate-600 dark:text-slate-300">{titleOf(card)}</span>
        <span className="flex-1" />
        {onShowResults !== null ? (
          <button
            type="button"
            onClick={onShowResults}
            className="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Show results
          </button>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded border border-slate-200 dark:border-slate-800">
        {rows.length > 0 ? (
          <table className="w-full text-sm font-mono">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
              <tr className="text-left">
                <th className="border-b border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  Metric
                </th>
                <th className="border-b border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                  <td className="border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
                    {row.label}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
                    {row.value.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {message !== undefined ? (
          <p className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
