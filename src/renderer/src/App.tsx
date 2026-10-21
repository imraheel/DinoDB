import { useEffect, useState } from 'react';
import ConnectionModal from './components/ConnectionModal';
import SettingsModal from './components/SettingsModal';
import Sidebar from './components/Sidebar';
import TabBar from './components/TabBar';
import TabIndexManager from './components/TabIndexManager';
import TabWorkspace from './components/TabWorkspace';
import Titlebar from './components/Titlebar';
import WelcomeScreen from './components/WelcomeScreen';
import { useApp } from './context/AppState';
import { setMonacoAccent, setMonacoTheme } from './lib/monaco';
import { applyAppearance } from './lib/appearance';
import { applyTheme, resolveTheme } from './lib/theme';
import type { ConnectionConfig } from '../../shared/types';

const IS_MACOS = /Macintosh|Mac OS X/.test(navigator.userAgent);

export default function AppShell() {
  const { state, dispatch } = useApp();
  const [modal, setModal] = useState<{ open: boolean; editing: ConnectionConfig | null }>({
    open: false,
    editing: null
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);

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

  useEffect(() => {
    const unsubscribe = window.api.onMenuAction((action) => {
      if (action === 'open-preferences') setSettingsOpen(true);
      else if (action === 'open-connections') setConnectionsOpen(true);
      else if (action === 'new-connection') setModal({ open: true, editing: null });
    });
    return unsubscribe;
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
          onConnect={() => setConnectionsOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : null}
      <div className="flex min-h-0 flex-1">
        <Sidebar
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
              tab.kind === 'indexes' ? (
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
