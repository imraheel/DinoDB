import type { FindResult } from '../../../shared/ipc';
import type { AppSettings, ConnectionConfig, QueryInput, SchemaField } from '../../../shared/types';
import { DEFAULT_SETTINGS } from '../../../shared/types';

export interface SessionState {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  error?: string;
  databases: string[];
  expanded: Record<string, boolean>;
  collections: Record<string, string[] | 'loading'>;
}

export interface TabMeta {
  id: string;
  connectionId: string;
  connectionName: string;
  database: string;
  collection: string;
  title: string;
}

export interface TabData {
  mode: 'browse' | 'aggregate';
  query: QueryInput;
  pipeline: string;
  fields: SchemaField[];
  loading: boolean;
  findResults?: FindResult;
  aggResults?: FindResult;
  error?: string;
}

export interface AppStateState {
  settings: AppSettings;
  connections: ConnectionConfig[];
  sessions: Record<string, SessionState>;
  tabs: TabMeta[];
  activeTabId: string | null;
  tabData: Record<string, TabData>;
}

export type AppAction =
  | { type: 'settings/loaded'; settings: AppSettings }
  | { type: 'settings/patched'; patch: Partial<AppSettings> }
  | { type: 'connections/loaded'; connections: ConnectionConfig[] }
  | { type: 'connections/upserted'; connection: ConnectionConfig }
  | { type: 'connections/removed'; id: string }
  | { type: 'session/connecting'; connectionId: string }
  | { type: 'session/connected'; connectionId: string; databases: string[] }
  | { type: 'session/errored'; connectionId: string; error: string }
  | { type: 'session/disconnected'; connectionId: string }
  | { type: 'session/expand'; connectionId: string; database: string }
  | { type: 'session/collections'; connectionId: string; database: string; collections: string[] }
  | { type: 'tab/added'; tab: TabMeta; fields: SchemaField[] }
  | { type: 'tab/removed'; tabId: string }
  | { type: 'tab/activated'; tabId: string }
  | { type: 'tab/query'; tabId: string; patch: Partial<QueryInput> }
  | { type: 'tab/mode'; tabId: string; mode: TabData['mode'] }
  | { type: 'tab/pipeline'; tabId: string; pipeline: string }
  | { type: 'tab/loading'; tabId: string; loading: boolean }
  | { type: 'tab/results'; tabId: string; source: 'find' | 'aggregate'; results: FindResult }
  | { type: 'tab/errored'; tabId: string; error: string }
  | { type: 'tab/errorCleared'; tabId: string };

export function emptySession(): SessionState {
  return { status: 'idle', databases: [], expanded: {}, collections: {} };
}

export function createDefaultQuery(defaultLimit: number): QueryInput {
  return { filter: '', projection: '', sort: '', skip: '0', limit: String(defaultLimit) };
}

export function createDefaultPipeline(defaultLimit: number): string {
  return '[\n  {\n    "$match": {}\n  }\n]';
}

export const initialState: AppStateState = {
  settings: DEFAULT_SETTINGS,
  connections: [],
  sessions: {},
  tabs: [],
  activeTabId: null,
  tabData: {}
};

function neighborTabId(tabs: TabMeta[], index: number): string | null {
  if (index > 0) return tabs[index - 1].id;
  return tabs[1]?.id ?? null;
}

export function reducer(state: AppStateState, action: AppAction): AppStateState {
  switch (action.type) {
    case 'settings/loaded':
      return { ...state, settings: action.settings };
    case 'settings/patched':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'connections/loaded':
      return { ...state, connections: action.connections };
    case 'connections/upserted': {
      const exists = state.connections.some((c) => c.id === action.connection.id);
      return {
        ...state,
        connections: exists
          ? state.connections.map((c) => (c.id === action.connection.id ? action.connection : c))
          : [...state.connections, action.connection]
      };
    }
    case 'connections/removed': {
      const removedTabIds = new Set(
        state.tabs.filter((t) => t.connectionId === action.id).map((t) => t.id)
      );
      const tabs = state.tabs.filter((t) => t.connectionId !== action.id);
      let activeTabId = state.activeTabId;
      if (activeTabId !== null && removedTabIds.has(activeTabId)) {
        const oldIndex = state.tabs.findIndex((t) => t.id === activeTabId);
        activeTabId = null;
        for (let i = oldIndex - 1; i >= 0; i--) {
          if (!removedTabIds.has(state.tabs[i].id)) {
            activeTabId = state.tabs[i].id;
            break;
          }
        }
        if (activeTabId === null) {
          for (let i = oldIndex + 1; i < state.tabs.length; i++) {
            if (!removedTabIds.has(state.tabs[i].id)) {
              activeTabId = state.tabs[i].id;
              break;
            }
          }
        }
      }
      const sessions = { ...state.sessions };
      delete sessions[action.id];
      const tabData = { ...state.tabData };
      for (const tabId of removedTabIds) delete tabData[tabId];
      return {
        ...state,
        connections: state.connections.filter((c) => c.id !== action.id),
        sessions,
        tabs,
        activeTabId,
        tabData
      };
    }
    case 'session/connecting': {
      const session = state.sessions[action.connectionId] ?? emptySession();
      const next: SessionState = { ...session, status: 'connecting', error: undefined };
      return { ...state, sessions: { ...state.sessions, [action.connectionId]: next } };
    }
    case 'session/connected': {
      const session = state.sessions[action.connectionId] ?? emptySession();
      const next: SessionState = {
        ...session,
        status: 'connected',
        error: undefined,
        databases: action.databases
      };
      return { ...state, sessions: { ...state.sessions, [action.connectionId]: next } };
    }
    case 'session/errored': {
      const session = state.sessions[action.connectionId] ?? emptySession();
      const next: SessionState = { ...session, status: 'error', error: action.error };
      return { ...state, sessions: { ...state.sessions, [action.connectionId]: next } };
    }
    case 'session/disconnected':
      return { ...state, sessions: { ...state.sessions, [action.connectionId]: emptySession() } };
    case 'session/expand': {
      const session = state.sessions[action.connectionId] ?? emptySession();
      const next: SessionState = {
        ...session,
        expanded: { ...session.expanded, [action.database]: !(session.expanded[action.database] ?? false) }
      };
      return { ...state, sessions: { ...state.sessions, [action.connectionId]: next } };
    }
    case 'session/collections': {
      const session = state.sessions[action.connectionId] ?? emptySession();
      const next: SessionState = {
        ...session,
        collections: { ...session.collections, [action.database]: action.collections }
      };
      return { ...state, sessions: { ...state.sessions, [action.connectionId]: next } };
    }
    case 'tab/added': {
      const tabData: Record<string, TabData> = {
        ...state.tabData,
        [action.tab.id]: {
          mode: 'browse',
          query: createDefaultQuery(state.settings.defaultLimit),
          pipeline: createDefaultPipeline(state.settings.defaultLimit),
          fields: action.fields,
          loading: false
        }
      };
      return { ...state, tabs: [...state.tabs, action.tab], activeTabId: action.tab.id, tabData };
    }
    case 'tab/removed': {
      const index = state.tabs.findIndex((t) => t.id === action.tabId);
      if (index === -1) return state;
      const activeTabId =
        state.activeTabId === action.tabId ? neighborTabId(state.tabs, index) : state.activeTabId;
      const tabData = { ...state.tabData };
      delete tabData[action.tabId];
      return {
        ...state,
        tabs: state.tabs.filter((t) => t.id !== action.tabId),
        activeTabId,
        tabData
      };
    }
    case 'tab/activated':
      return { ...state, activeTabId: action.tabId };
    case 'tab/query': {
      const data = state.tabData[action.tabId];
      if (!data) return state;
      const next: TabData = { ...data, query: { ...data.query, ...action.patch } };
      return { ...state, tabData: { ...state.tabData, [action.tabId]: next } };
    }
    case 'tab/mode': {
      const data = state.tabData[action.tabId];
      if (!data) return state;
      const next: TabData = { ...data, mode: action.mode };
      return { ...state, tabData: { ...state.tabData, [action.tabId]: next } };
    }
    case 'tab/pipeline': {
      const data = state.tabData[action.tabId];
      if (!data) return state;
      const next: TabData = { ...data, pipeline: action.pipeline };
      return { ...state, tabData: { ...state.tabData, [action.tabId]: next } };
    }
    case 'tab/loading': {
      const data = state.tabData[action.tabId];
      if (!data) return state;
      const next: TabData = { ...data, loading: action.loading };
      return { ...state, tabData: { ...state.tabData, [action.tabId]: next } };
    }
    case 'tab/results': {
      const data = state.tabData[action.tabId];
      if (!data) return state;
      const next: TabData =
        action.source === 'find'
          ? { ...data, findResults: action.results }
          : { ...data, aggResults: action.results };
      return { ...state, tabData: { ...state.tabData, [action.tabId]: next } };
    }
    case 'tab/errored': {
      const data = state.tabData[action.tabId];
      if (!data) return state;
      const next: TabData = { ...data, error: action.error };
      return { ...state, tabData: { ...state.tabData, [action.tabId]: next } };
    }
    case 'tab/errorCleared': {
      const data = state.tabData[action.tabId];
      if (!data) return state;
      const next: TabData = { ...data };
      delete next.error;
      return { ...state, tabData: { ...state.tabData, [action.tabId]: next } };
    }
    default:
      return state;
  }
}
