import { useApp } from '../context/AppState';

export default function TabBar() {
  const { state, dispatch } = useApp();

  if (state.tabs.length === 0) return null;

  return (
    <div className="flex h-9 shrink-0 items-end gap-1 overflow-x-auto border-b border-slate-200 bg-slate-100 px-2 pt-1 dark:border-slate-800 dark:bg-slate-900">
      {state.tabs.map((tab) => {
        const active = tab.id === state.activeTabId;
        return (
          <div
            key={tab.id}
            className={
              active
                ? 'flex max-w-52 shrink-0 items-center rounded-t-md border border-b-0 border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
                : 'flex max-w-52 shrink-0 items-center rounded-t-md hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
            }
          >
            <button
              type="button"
              onClick={() => dispatch({ type: 'tab/activated', tabId: tab.id })}
              className={
                active
                  ? 'min-w-0 flex-1 truncate py-1.5 pl-3 text-left text-xs text-slate-900 dark:text-slate-100'
                  : 'min-w-0 flex-1 truncate py-1.5 pl-3 text-left text-xs text-slate-500 dark:text-slate-400'
              }
            >
              {tab.title}
            </button>
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              onClick={(event) => {
                event.stopPropagation();
                dispatch({ type: 'tab/removed', tabId: tab.id });
                void window.api.closeTab(tab.id).catch(() => {});
              }}
              className="shrink-0 rounded-full px-1.5 py-1.5 text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
