import type { ResultCard as ResultCardData } from '../context/reducer';

interface ResultCardProps {
  card: ResultCardData;
  onShowResults: (() => void) | null;
}

export default function ResultCard({ card, onShowResults }: ResultCardProps) {
  if (card.kind === 'count') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="rounded-lg border border-slate-200 bg-white px-10 py-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-4xl font-semibold text-slate-900 dark:text-slate-50">
            {card.count.toLocaleString()}
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">documents match</p>
        </div>
      </div>
    );
  }

  const rows: Array<{ label: string; value: number }> = [];
  if (card.op.startsWith('update') || card.op === 'replaceOne') {
    rows.push({ label: 'Matched', value: card.matched });
    rows.push({ label: 'Modified', value: card.modified });
    if (card.inserted > 0) rows.push({ label: 'Upserted', value: card.inserted });
  }
  if (card.op.startsWith('delete')) rows.push({ label: 'Deleted', value: card.deleted });
  if (card.op.startsWith('insert')) rows.push({ label: 'Inserted', value: card.inserted });

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <div className="rounded-lg border border-slate-200 bg-white px-10 py-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
          {card.op}() succeeded
        </p>
        {card.message !== undefined ? (
          <p className="mt-2 max-w-sm text-xs text-slate-500 dark:text-slate-400">{card.message}</p>
        ) : null}
        {rows.length > 0 ? (
          <dl className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
            {rows.map((row) => (
              <div key={row.label} className="flex justify-center gap-4">
                <dt className="text-slate-400 dark:text-slate-500">{row.label}</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-200">
                  {row.value.toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {onShowResults !== null ? (
          <button
            type="button"
            onClick={onShowResults}
            className="mt-4 rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Show results
          </button>
        ) : null}
      </div>
    </div>
  );
}
