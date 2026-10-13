import { useEffect, useState } from 'react';
import ConnectionModal from './components/ConnectionModal';
import SettingsModal from './components/SettingsModal';
import Sidebar from './components/Sidebar';
import TabBar from './components/TabBar';
import TabWorkspace from './components/TabWorkspace';
import { useApp } from './context/AppState';
import { setMonacoTheme } from './lib/monaco';
import { applyTheme, resolveTheme } from './lib/theme';
import type { ConnectionConfig } from '../../shared/types';

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
    setMonacoTheme(resolveTheme(state.settings.theme) === 'dark');
  }, [state.settings.theme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (state.settings.theme !== 'system') return;
      applyTheme(state.settings.theme);
      setMonacoTheme(resolveTheme(state.settings.theme) === 'dark');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [state.settings.theme]);

  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;

  return (
    <div className="flex h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar
        onAdd={() => setModal({ open: true, editing: null })}
        onEdit={(connection) => setModal({ open: true, editing: connection })}
        manageOpen={connectionsOpen}
        onManageOpen={() => setConnectionsOpen(true)}
        onManageClose={() => setConnectionsOpen(false)}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TabBar />
        {activeTab !== null ? (
          <TabWorkspace key={activeTab.id} tab={activeTab} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Open a collection from the sidebar to start working.
            </p>
          </div>
        )}
      </main>
      <ConnectionModal
        open={modal.open}
        editing={modal.editing}
        onClose={() => setModal({ open: false, editing: null })}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
