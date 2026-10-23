import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react';
import { useApp } from '../context/AppState';
import type { TabMeta } from '../context/reducer';
import Menu, { MenuItem, MenuSeparator } from './ui/Menu';
import PromptDialog from './PromptDialog';

interface IconProps {
  size?: number;
}

function PinIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  );
}

function PencilIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function XIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function CheckIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ChevronDownIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export default function TabBar() {
  const { state, dispatch } = useApp();
  const barRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const intersectingRef = useRef(new Map<string, boolean>());
  const tabsRef = useRef(state.tabs);
  tabsRef.current = state.tabs;
  const dragStateRef = useRef<{
    tabId: string;
    pinned: boolean;
    started: boolean;
    drop: { id: string; position: 'before' | 'after' } | null;
  } | null>(null);
  const [clippedIds, setClippedIds] = useState<ReadonlySet<string>>(new Set());
  const [overflowMenu, setOverflowMenu] = useState<{ x: number; y: number } | null>(null);
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const [rename, setRename] = useState<{ tabId: string; initial: string } | null>(null);
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(
    null
  );

  const pinnedTabs = state.tabs.filter((t) => t.pinned === true);
  const unpinnedTabs = state.tabs.filter((t) => t.pinned !== true);
  const tabsKey = unpinnedTabs.map((t) => t.id).join(' ');

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    intersectingRef.current.clear();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.tabId;
          if (id !== undefined) intersectingRef.current.set(id, entry.isIntersecting);
        }
        const next = new Set<string>();
        for (const [id, isIntersecting] of intersectingRef.current) {
          if (!isIntersecting) next.add(id);
        }
        setClippedIds(next);
      },
      { root: container, threshold: 0 }
    );
    for (const element of tabRefs.current.values()) observer.observe(element);
    return () => observer.disconnect();
  }, [tabsKey]);

  useEffect(() => {
    const id = state.activeTabId;
    if (id === null) return;
    const element = tabRefs.current.get(id);
    const container = containerRef.current;
    if (element === undefined || container === null) return;
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    if (elementRect.left < containerRect.left || elementRect.right > containerRect.right) {
      element.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }, [state.activeTabId]);

  function closeTab(tabId: string) {
    dispatch({ type: 'tab/removed', tabId });
    void window.api.closeTab(tabId).catch(() => {});
  }

  function closeOtherTabs(keepTabId: string) {
    for (const tab of state.tabs) {
      if (tab.id === keepTabId) continue;
      dispatch({ type: 'tab/removed', tabId: tab.id });
      void window.api.closeTab(tab.id).catch(() => {});
    }
    dispatch({ type: 'tab/activated', tabId: keepTabId });
  }

  function openTabMenu(event: ReactMouseEvent<HTMLDivElement>, tabId: string) {
    event.preventDefault();
    event.stopPropagation();
    setTabMenu({ x: event.clientX, y: event.clientY, tabId });
  }

  function handleTabMenu(action: () => void) {
    return () => {
      setTabMenu(null);
      action();
    };
  }

  function handleTabMouseDown(event: ReactMouseEvent<HTMLDivElement>, tab: TabMeta) {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const dragState = {
      tabId: tab.id,
      pinned: tab.pinned === true,
      started: false,
      drop: null as { id: string; position: 'before' | 'after' } | null
    };
    dragStateRef.current = dragState;

    const handleMove = (moveEvent: MouseEvent) => {
      if (!dragState.started) {
        if (Math.abs(moveEvent.clientX - startX) < 4) return;
        dragState.started = true;
        setDragTabId(dragState.tabId);
      }
      const group = tabsRef.current.filter((t) => (t.pinned === true) === dragState.pinned);
      let drop: { id: string; position: 'before' | 'after' } | null = null;
      for (const candidate of group) {
        if (candidate.id === dragState.tabId) continue;
        const element = barRef.current?.querySelector<HTMLElement>(
          `[data-tab-id="${candidate.id}"]`
        );
        if (element === undefined || element === null) continue;
        const rect = element.getBoundingClientRect();
        if (moveEvent.clientX < rect.left + rect.width / 2) {
          drop = { id: candidate.id, position: 'before' };
          break;
        }
        drop = { id: candidate.id, position: 'after' };
      }
      dragState.drop = drop;
      setDropTarget((prev) => {
        if (prev === null && drop === null) return prev;
        if (
          prev !== null &&
          drop !== null &&
          prev.id === drop.id &&
          prev.position === drop.position
        ) {
          return prev;
        }
        return drop;
      });
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      dragStateRef.current = null;
      if (dragState.started && dragState.drop !== null) {
        dispatch({
          type: 'tab/reordered',
          tabId: dragState.tabId,
          targetId: dragState.drop.id,
          position: dragState.drop.position
        });
      }
      setDragTabId(null);
      setDropTarget(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }

  function renderTab(tab: TabMeta) {
    const active = tab.id === state.activeTabId;
    const pinned = tab.pinned === true;
    const dragging = dragTabId === tab.id;
    const dropBefore = dropTarget?.id === tab.id && dropTarget.position === 'before';
    const dropAfter = dropTarget?.id === tab.id && dropTarget.position === 'after';
    return (
      <div
        key={tab.id}
        ref={(element) => {
          if (pinned) return;
          if (element === null) tabRefs.current.delete(tab.id);
          else tabRefs.current.set(tab.id, element);
        }}
        data-tab-id={tab.id}
        title={tab.title}
        onMouseDown={(event) => handleTabMouseDown(event, tab)}
        onContextMenu={(event) => openTabMenu(event, tab.id)}
        className={`window-no-drag group relative flex items-center rounded-t-[6px] ${
          pinned ? 'w-40 shrink-0' : 'min-w-40 max-w-52 flex-1'
        } ${dragging ? 'opacity-50' : ''} ${
          active ? 'bg-surface shadow-[0_-1px_2px_rgba(0,0,0,0.04)]' : 'hover:bg-sidebar-hover'
        }`}
      >
        {dropBefore ? (
          <span className="pointer-events-none absolute top-1 bottom-1 -left-px w-[2px] rounded-full bg-accent" />
        ) : null}
        {dropAfter ? (
          <span className="pointer-events-none absolute top-1 bottom-1 -right-px w-[2px] rounded-full bg-accent" />
        ) : null}
        <button
          type="button"
          onClick={() => dispatch({ type: 'tab/activated', tabId: tab.id })}
          className={`flex min-w-0 flex-1 items-center gap-1 py-1.5 pl-2.5 text-left text-ui ${
            active ? 'font-medium text-label' : 'text-label-secondary'
          }`}
        >
          {pinned ? (
            <span className={`shrink-0 ${active ? 'text-label-secondary' : 'text-label-tertiary'}`}>
              <PinIcon size={11} />
            </span>
          ) : null}
          <span className="min-w-0 truncate">{tab.title}</span>
        </button>
        <button
          type="button"
          aria-label={`Close ${tab.title}`}
          onClick={(event) => {
            event.stopPropagation();
            closeTab(tab.id);
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
  }

  const menuTab = tabMenu !== null ? state.tabs.find((t) => t.id === tabMenu.tabId) : undefined;
  const overflowTabs = unpinnedTabs.filter((t) => clippedIds.has(t.id));

  return (
    <div
      ref={barRef}
      className="flex h-9 shrink-0 items-end border-b border-border bg-chrome select-none"
    >
      {pinnedTabs.length > 0 ? (
        <div className="flex shrink-0 items-end gap-1 px-2 pt-1">{pinnedTabs.map(renderTab)}</div>
      ) : null}
      <div ref={containerRef} className="relative flex min-w-0 flex-1 items-end overflow-hidden">
        <div className="flex min-w-0 flex-1 items-end gap-1 px-2 pt-1">
          {unpinnedTabs.map(renderTab)}
        </div>
      </div>
      {overflowTabs.length > 0 ? (
        <button
          type="button"
          aria-label="Show hidden tabs"
          title="Hidden tabs"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setOverflowMenu({ x: rect.left, y: rect.bottom });
          }}
          className="window-no-drag mb-1 mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-label-secondary hover:bg-sidebar-hover"
        >
          <ChevronDownIcon size={14} />
        </button>
      ) : null}
      {overflowMenu !== null ? (
        <Menu
          x={overflowMenu.x}
          y={overflowMenu.y}
          onClose={() => setOverflowMenu(null)}
          className="window-no-drag"
        >
          {overflowTabs.map((tab) => (
            <MenuItem
              key={tab.id}
              icon={tab.id === state.activeTabId ? <CheckIcon size={14} /> : undefined}
              onClick={() => {
                setOverflowMenu(null);
                dispatch({ type: 'tab/activated', tabId: tab.id });
              }}
            >
              {tab.title}
            </MenuItem>
          ))}
        </Menu>
      ) : null}
      {tabMenu !== null && menuTab !== undefined ? (
        <Menu
          x={tabMenu.x}
          y={tabMenu.y}
          onClose={() => setTabMenu(null)}
          className="window-no-drag"
        >
          <MenuItem
            icon={<PinIcon size={14} />}
            onClick={handleTabMenu(() =>
              dispatch({
                type: 'tab/pinned',
                tabId: menuTab.id,
                pinned: menuTab.pinned !== true
              })
            )}
          >
            {menuTab.pinned === true ? 'Unpin tab' : 'Pin tab'}
          </MenuItem>
          <MenuItem
            icon={<PencilIcon size={14} />}
            onClick={handleTabMenu(() => setRename({ tabId: menuTab.id, initial: menuTab.title }))}
          >
            Rename tab
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<XIcon size={14} />} onClick={handleTabMenu(() => closeTab(menuTab.id))}>
            Close tab
          </MenuItem>
          {state.tabs.length > 1 ? (
            <MenuItem
              icon={<XIcon size={14} />}
              onClick={handleTabMenu(() => closeOtherTabs(menuTab.id))}
            >
              Close other tabs
            </MenuItem>
          ) : null}
        </Menu>
      ) : null}
      <PromptDialog
        open={rename !== null}
        title="Rename tab"
        label="Title"
        initial={rename?.initial ?? ''}
        confirmLabel="Rename"
        onConfirm={(value) => {
          if (rename !== null) {
            dispatch({ type: 'tab/retitled', tabId: rename.tabId, title: value });
          }
        }}
        onClose={() => setRename(null)}
      />
    </div>
  );
}
