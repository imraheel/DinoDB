import { useApp } from '../context/AppState';
import Button from './ui/Button';

interface TitlebarProps {
  collapsed: boolean;
  onToggleSidebar(): void;
  onConnect(): void;
  onOpenSettings(): void;
}

function PanelLeftIcon({ size = 16 }: { size?: number }) {
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
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

function SettingsIcon({ size = 16 }: { size?: number }) {
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
      <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function Titlebar({
  collapsed,
  onToggleSidebar,
  onConnect,
  onOpenSettings
}: TitlebarProps) {
  const { state } = useApp();
  const title = state.tabs.find((tab) => tab.id === state.activeTabId)?.title ?? 'NexDB';

  return (
    <div className="window-drag relative flex h-9 shrink-0 items-center border-b border-border bg-chrome select-none">
      <div className="w-[70px] shrink-0" />
      <span className="pointer-events-none absolute left-1/2 max-w-[55%] -translate-x-1/2 truncate text-ui font-medium text-label">
        {title}
      </span>
      <span className="flex-1" />
      <div className="window-no-drag flex shrink-0 items-center gap-1 pr-1.5">
        <Button
          variant="quiet"
          size="sm"
          className="font-medium text-accent"
          aria-label="Manage connections"
          onClick={onConnect}
        >
          Connect
        </Button>
        <Button
          variant="quiet"
          size="sm"
          aria-pressed={!collapsed}
          aria-label="Toggle sidebar"
          title="Toggle sidebar (⌘B)"
          onClick={onToggleSidebar}
          className="w-8 px-0"
        >
          <PanelLeftIcon />
        </Button>
        <Button
          variant="quiet"
          size="sm"
          aria-label="Settings"
          title="Settings"
          onClick={onOpenSettings}
          className="w-8 px-0"
        >
          <SettingsIcon />
        </Button>
      </div>
    </div>
  );
}
