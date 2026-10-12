import type { KeyboardEvent } from 'react';
import { useApp } from '../context/AppState';
import type { QueryInput } from '../../../shared/types';

interface QueryBarProps {
  tabId: string;
  query: QueryInput;
  loading: boolean;
  onRun(): void;
}

const TEXT_INPUT_CLASS =
  'min-w-0 flex-1 rounded border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const NUMBER_INPUT_CLASS =
  'w-20 rounded border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const LABEL_CLASS = 'text-xs text-slate-500 dark:text-slate-400';

export default function QueryBar({ tabId, query, loading, onRun }: QueryBarProps) {
  const { dispatch } = useApp();

  function patch(partial: Partial<QueryInput>) {
    dispatch({ type: 'tab/query', tabId, patch: partial });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const modifier = /Mac/i.test(navigator.userAgent) ? event.metaKey : event.ctrlKey;
    if (modifier && event.key === 'Enter') {
      event.preventDefault();
      onRun();
    }
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800"
      onKeyDown={handleKeyDown}
    >
      <input
        aria-label="Filter"
        placeholder='{"active": true}'
        value={query.filter}
        onChange={(event) => patch({ filter: event.target.value })}
        className={TEXT_INPUT_CLASS}
      />
      <input
        aria-label="Projection"
        placeholder='{"name": 1}'
        value={query.projection}
        onChange={(event) => patch({ projection: event.target.value })}
        className={TEXT_INPUT_CLASS}
      />
      <input
        aria-label="Sort"
        placeholder='{"_id": -1}'
        value={query.sort}
        onChange={(event) => patch({ sort: event.target.value })}
        className={TEXT_INPUT_CLASS}
      />
      <label className="flex items-center gap-1">
        <span className={LABEL_CLASS}>Skip</span>
        <input
          aria-label="Skip"
          type="number"
          min={0}
          value={query.skip}
          onChange={(event) => patch({ skip: event.target.value })}
          className={NUMBER_INPUT_CLASS}
        />
      </label>
      <label className="flex items-center gap-1">
        <span className={LABEL_CLASS}>Limit</span>
        <input
          aria-label="Limit"
          type="number"
          min={1}
          value={query.limit}
          onChange={(event) => patch({ limit: event.target.value })}
          className={NUMBER_INPUT_CLASS}
        />
      </label>
      <button
        type="button"
        onClick={onRun}
        disabled={loading}
        className="shrink-0 rounded bg-emerald-600 px-4 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {loading ? 'Running…' : 'Run'}
      </button>
    </div>
  );
}
