import { useEffect, useRef, useState } from 'react';
import ConnectionModal from '../components/connections/ConnectionModal';
import SettingsModal from '../components/settings/SettingsModal';
import Sidebar from './Sidebar';
import TabBar from './TabBar';
import TabIndexManager from '../views/TabIndexManager';
import TabTransfer from '../views/TabTransfer';
import TabDatabaseTransfer from '../views/TabDatabaseTransfer';
import TabShell from '../views/TabShell';
import TabWorkspace from '../views/workspace/TabWorkspace';
import Titlebar from './Titlebar';
import WelcomeScreen from '../views/WelcomeScreen';
import { useApp } from '../context/AppState';
import { setMonacoAccent, setMonacoTheme } from '../lib/monaco';
import { applyAppearance } from '../lib/appearance';
import { applyTheme, resolveTheme } from '../lib/theme';
import { hasPrimaryModifier } from '../lib/shortcuts';
import type { ConnectionConfig } from '../../../shared/types';

const IS_MACOS = /Macintosh|Mac OS X/.test(navigator.userAgent);

export default function AppShell() {
  const { state, dispatch } = useApp();
  const [modal, setModal] = useState<{ open: boolean; editing: ConnectionConfig | null }>({
    open: false,
    editing: null
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    const handler = () => setSettingsOpen(true);
    window.addEventListener('open-database-tools', handler);
    return () => window.removeEventListener('open-database-tools', handler);
  }, []);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([window.api.getSettings(), window.api.listConnections()])
      .then(([settings, connections]) => {
        if (!active) return;
        dispatch({ type: 'settings/loaded', settings });
        dispatch({ type: 'connections/loaded', connections });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [dispatch]);

  const activeTabIdRef = useRef(state.activeTabId);
  activeTabIdRef.current = state.activeTabId;

  useEffect(() => {
    const unsubscribe = window.api.onMenuAction((action) => {
      if (action === 'open-preferences') setSettingsOpen(true);
      else if (action === 'open-connections') setConnectionsOpen(true);
      else if (action === 'new-connection') setModal({ open: true, editing: null });
      else if (action === 'close-tab') {
        const tabId = activeTabIdRef.current;
        if (tabId === null) return;
        dispatch({ type: 'tab/removed', tabId });
        void window.api.closeTab(tabId).catch(() => {});
      }
    });
    return unsubscribe;
  }, [dispatch]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        hasPrimaryModifier(event) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'b'
      ) {
        event.preventDefault();
        setSidebarCollapsed((previous) => !previous);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    applyTheme(state.settings.theme);
    applyAppearance(state.settings);
    setMonacoAccent(state.settings.accent);
    setMonacoTheme(resolveTheme(state.settings.theme) === 'dark');
  }, [
    state.settings.theme,
    state.settings.accent,
    state.settings.uiFont,
    state.settings.codeFont,
    state.settings.uiFontSize,
    state.settings.tableFontSize
  ]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (state.settings.theme !== 'system') return;
      applyTheme(state.settings.theme);
      applyAppearance(state.settings);
      setMonacoTheme(resolveTheme(state.settings.theme) === 'dark');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [
    state.settings.theme,
    state.settings.accent,
    state.settings.uiFont,
    state.settings.codeFont,
    state.settings.uiFontSize,
    state.settings.tableFontSize
  ]);

  return (
    <div className="flex h-screen flex-col">
      {IS_MACOS ? (
        <Titlebar
          collapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((previous) => !previous)}
          onConnect={() => setConnectionsOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : null}
      <div className="flex min-h-0 flex-1">
        <Sidebar
          collapsed={sidebarCollapsed}
          onAdd={() => setModal({ open: true, editing: null })}
          onEdit={(connection) => setModal({ open: true, editing: connection })}
          manageOpen={connectionsOpen}
          onManageClose={() => setConnectionsOpen(false)}
        />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg">
          <TabBar />
          {state.tabs.length === 0 ? (
            <WelcomeScreen
              onOpenManager={() => setConnectionsOpen(true)}
              onNewConnection={() => setModal({ open: true, editing: null })}
            />
          ) : (
            state.tabs.map((tab) =>
              tab.kind === 'shell' ? (
                <TabShell key={tab.id} tab={tab} active={tab.id === state.activeTabId} />
              ) : tab.kind === 'database-backup' || tab.kind === 'database-restore' ? (
                <TabDatabaseTransfer key={tab.id} tab={tab} active={tab.id === state.activeTabId} />
              ) : tab.kind === 'import' || tab.kind === 'export' ? (
                <TabTransfer key={tab.id} tab={tab} active={tab.id === state.activeTabId} />
              ) : tab.kind === 'indexes' ? (
                <TabIndexManager key={tab.id} tab={tab} active={tab.id === state.activeTabId} />
              ) : (
                <TabWorkspace key={tab.id} tab={tab} active={tab.id === state.activeTabId} />
              )
            )
          )}
        </main>
      </div>
      <ConnectionModal
        open={modal.open}
        editing={modal.editing}
        onClose={() => setModal({ open: false, editing: null })}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
