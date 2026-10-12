import { formatCell, getColumns } from '../lib/format';
import type { SchemaField } from '../../../shared/types';

interface DataTableProps {
  fields: SchemaField[];
  documents: unknown[];
  truncated: boolean;
  loading: boolean;
  readOnly: boolean;
  onInsert?(): void;
  onEdit?(doc: unknown): void;
  onDelete?(doc: unknown): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rowKey(document: unknown, index: number): string {
  if (isRecord(document)) {
    const id = document._id;
    if (id !== undefined) return JSON.stringify(id);
  }
  return String(index);
}

export default function DataTable({
  fields,
  documents,
  truncated,
  loading,
  readOnly,
  onInsert,
  onEdit,
  onDelete
}: DataTableProps) {
  const columns = getColumns(fields, documents);
  const showActions = !readOnly && (onEdit !== undefined || onDelete !== undefined);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 pb-1.5">
        <span className="text-xs text-slate-600 dark:text-slate-300">
          {documents.length} documents
        </span>
        {truncated ? (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Showing first {documents.length} — narrow your query
          </span>
        ) : null}
        <span className="flex-1" />
        {!readOnly && onInsert !== undefined ? (
          <button
            type="button"
            onClick={onInsert}
            className="shrink-0 rounded border border-emerald-600 px-2 py-0.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-950"
          >
            Insert document
          </button>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded border border-slate-200 dark:border-slate-800">
        {documents.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {loading ? 'Loading…' : 'No documents match this query.'}
          </p>
        ) : (
          <table className="w-full text-sm font-mono">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
              <tr className="text-left">
                {columns.map((column) => (
                  <th
                    key={column}
                    className="border-b border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                  >
                    {column}
                  </th>
                ))}
                {showActions ? (
                  <th className="border-b border-slate-200 dark:border-slate-700" />
                ) : null}
              </tr>
            </thead>
            <tbody>
              {documents.map((document, index) => (
                <tr
                  key={rowKey(document, index)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-900"
                >
                  {columns.map((column) => {
                    const text = isRecord(document) ? formatCell(document[column]) : '';
                    return (
                      <td
                        key={column}
                        title={text}
                        className="max-w-72 truncate border-b border-slate-100 px-3 py-1.5 dark:border-slate-800"
                      >
                        {text}
                      </td>
                    );
                  })}
                  {showActions ? (
                    <td className="whitespace-nowrap border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
                      {onEdit !== undefined ? (
                        <button
                          type="button"
                          onClick={() => onEdit(document)}
                          className="text-emerald-600 hover:underline dark:text-emerald-400"
                        >
                          Edit
                        </button>
                      ) : null}
                      {onEdit !== undefined && onDelete !== undefined ? (
                        <span className="px-1 text-slate-300 dark:text-slate-600">·</span>
                      ) : null}
                      {onDelete !== undefined ? (
                        <button
                          type="button"
                          onClick={() => onDelete(document)}
                          className="text-red-600 hover:underline dark:text-red-400"
                        >
                          Delete
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {loading && documents.length > 0 ? (
          <p className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400">Refreshing…</p>
        ) : null}
      </div>
    </div>
  );
}
