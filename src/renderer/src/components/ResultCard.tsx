import type { ResultCard as ResultCardData } from '../context/reducer';
import Button from './ui/Button';
import JsonTree from './ui/JsonTree';

interface ResultCardProps {
  card: ResultCardData;
  onShowResults: (() => void) | null;
}

function rowsOf(card: ResultCardData): Array<{ label: string; value: number }> {
  if (card.kind === 'count') {
    return [{ label: 'count', value: card.count }];
  }
  if (card.kind === 'explain') return [];
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
  if (card.kind === 'count') return 'countDocuments';
  if (card.kind === 'explain') return `Explain · ${card.op}`;
  return `${card.op}()`;
}

export default function ResultCard({ card, onShowResults }: ResultCardProps) {
  const rows = rowsOf(card);
  const message = card.kind === 'write' ? card.message : undefined;
  const explainPlan = card.kind === 'explain' ? card.plan : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 pb-1.5">
        <span className="text-xs text-label-secondary">{titleOf(card)}</span>
        <span className="flex-1" />
        {onShowResults !== null ? (
          <Button size="sm" onClick={onShowResults}>
            Show results
          </Button>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-field border border-border">
        {explainPlan !== undefined ? <JsonTree value={explainPlan} /> : null}
        {rows.length > 0 ? (
          <table className="w-full font-mono text-xs">
            <thead className="sticky top-0 z-10 bg-chrome">
              <tr className="text-left">
                <th className="border-b border-border px-3 py-1.5 text-caption font-semibold text-label-secondary">
                  Metric
                </th>
                <th className="border-b border-border px-3 py-1.5 text-caption font-semibold text-label-secondary">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="hover:bg-well">
                  <td className="border-b border-border px-3 py-1.5">{row.label}</td>
                  <td className="border-b border-border px-3 py-1.5">
                    {row.value.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {message !== undefined ? (
          <p className="px-3 py-1.5 text-xs text-label-tertiary">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
