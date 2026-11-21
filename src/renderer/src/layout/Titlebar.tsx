import { useApp } from '../context/AppState';
import Button from '../components/ui/Button';
import { PanelLeftIcon, SettingsIcon } from 'lucide-react';

interface TitlebarProps {
  collapsed: boolean;
  onToggleSidebar(): void;
  onConnect(): void;
  onOpenSettings(): void;
}

export default function Titlebar({
  collapsed,
  onToggleSidebar,
  onConnect,
  onOpenSettings
}: TitlebarProps) {
  const { state } = useApp();
  const title = state.tabs.find((tab) => tab.id === state.activeTabId)?.title ?? 'DinoDB';

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
          <PanelLeftIcon size={16} />
        </Button>
        <Button
          variant="quiet"
          size="sm"
          aria-label="Settings"
          title="Settings"
          onClick={onOpenSettings}
          className="w-8 px-0"
        >
          <SettingsIcon size={16} />
        </Button>
      </div>
    </div>
  );
}
