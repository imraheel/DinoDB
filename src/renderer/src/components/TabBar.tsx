import { useApp } from '../context/AppState';

export default function TabBar() {
  const { state, dispatch } = useApp();

  return (
    <div className="window-drag flex h-9 shrink-0 items-end gap-1 overflow-x-auto border-b border-border bg-chrome px-2 pt-1 select-none">
      {state.tabs.map((tab) => {
        const active = tab.id === state.activeTabId;
        return (
          <div
            key={tab.id}
            className={`window-no-drag group flex max-w-52 shrink-0 items-center rounded-t-[6px] ${
              active
                ? 'bg-surface shadow-[0_-1px_2px_rgba(0,0,0,0.04)]'
                : 'hover:bg-sidebar-hover'
            }`}
          >
            <button
              type="button"
              onClick={() => dispatch({ type: 'tab/activated', tabId: tab.id })}
              className={`min-w-0 flex-1 truncate py-1.5 pl-3 text-left text-xs ${
                active ? 'font-medium text-label' : 'text-label-secondary'
              }`}
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
              className={`mr-1.5 ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-label-tertiary transition-opacity duration-100 hover:bg-well hover:text-label ${
                active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden="true">
                <path
                  d="M1.5 1.5l7 7M8.5 1.5l-7 7"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
