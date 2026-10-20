import { describe, expect, it } from 'vitest';
import {
  createDefaultQuery,
  emptySession,
  initialState,
  reducer
} from './reducer';
import type { AppStateState, SessionState, TabMeta } from './reducer';
import type { FindResult } from '../../../shared/ipc';
import type { ConnectionConfig } from '../../../shared/types';
import { DEFAULT_SETTINGS } from '../../../shared/types';

function makeConnection(id: string): ConnectionConfig {
  return {
    id,
    name: `Conn ${id}`,
    host: 'localhost',
    port: 27017,
    defaultDatabase: '',
    username: '',
    password: '',
    authMechanism: '',
    authSource: '',
    authMechanismProperties: '',
    extraOptions: '',
    createdAt: 0,
    updatedAt: 0,
    lastConnectedAt: null
  };
}

function makeTab(id: string, connectionId = 'c1'): TabMeta {
  return { id, connectionId, connectionName: `Conn ${connectionId}`, database: 'db', collection: 'coll', title: 'db.coll' };
}

function stateWithTabs(tabs: TabMeta[]): AppStateState {
  let state = initialState;
  for (const tab of tabs) state = reducer(state, { type: 'tab/added', tab, fields: [] });
  return state;
}

describe('reducer tab actions', () => {
  it('tab/added seeds default query and fields and activates the tab', () => {
    const fields = [{ path: 'name', type: 'string' }];
    const state = reducer(initialState, { type: 'tab/added', tab: makeTab('t1'), fields });
    expect(state.tabs).toEqual([makeTab('t1')]);
    expect(state.activeTabId).toBe('t1');
    const data = state.tabData.t1;
    expect(data).toBeDefined();
    expect(data.loading).toBe(false);
    expect(data.fields).toEqual(fields);
    expect(data.query).toEqual(createDefaultQuery(DEFAULT_SETTINGS.defaultLimit, 'coll'));
    expect(data.query).toEqual({
      text: 'db.getCollection("coll").find({\n  \n})',
      skip: '0',
      limit: '50'
    });
    expect(data.findResults).toBeUndefined();
  });

  it('tab/added uses the settings defaultLimit', () => {
    const loaded = reducer(initialState, {
      type: 'settings/loaded',
      settings: { ...DEFAULT_SETTINGS, defaultLimit: 25 }
    });
    const state = reducer(loaded, { type: 'tab/added', tab: makeTab('t1'), fields: [] });
    expect(state.tabData.t1.query.limit).toBe('25');
  });

  it('tab/removed activates the previous tab for a middle removal', () => {
    const state = stateWithTabs([makeTab('a'), makeTab('b'), makeTab('c')]);
    const activated = reducer(state, { type: 'tab/activated', tabId: 'b' });
    const next = reducer(activated, { type: 'tab/removed', tabId: 'b' });
    expect(next.tabs.map((t) => t.id)).toEqual(['a', 'c']);
    expect(next.activeTabId).toBe('a');
    expect(next.tabData.b).toBeUndefined();
    expect(next.tabData.a).toBeDefined();
    expect(next.tabData.c).toBeDefined();
  });

  it('tab/removed activates the next tab when the first tab is removed', () => {
    const state = stateWithTabs([makeTab('a'), makeTab('b'), makeTab('c')]);
    const activated = reducer(state, { type: 'tab/activated', tabId: 'a' });
    const next = reducer(activated, { type: 'tab/removed', tabId: 'a' });
    expect(next.tabs.map((t) => t.id)).toEqual(['b', 'c']);
    expect(next.activeTabId).toBe('b');
  });

  it('tab/removed activates the previous tab when the last tab is removed', () => {
    const state = stateWithTabs([makeTab('a'), makeTab('b')]);
    const activated = reducer(state, { type: 'tab/activated', tabId: 'b' });
    const next = reducer(activated, { type: 'tab/removed', tabId: 'b' });
    expect(next.activeTabId).toBe('a');
  });

  it('tab/removed clears activeTabId when the only tab is removed', () => {
    const state = stateWithTabs([makeTab('a')]);
    const next = reducer(state, { type: 'tab/removed', tabId: 'a' });
    expect(next.tabs).toEqual([]);
    expect(next.activeTabId).toBeNull();
    expect(next.tabData).toEqual({});
  });

  it('tab/removed keeps activeTabId when another tab is removed', () => {
    const state = stateWithTabs([makeTab('a'), makeTab('b')]);
    const next = reducer(state, { type: 'tab/removed', tabId: 'a' });
    expect(next.activeTabId).toBe('b');
  });

  it('tab/results stores find results', () => {
    const find: FindResult = { documents: [{ a: 1 }], truncated: false };
    let state = stateWithTabs([makeTab('t1')]);
    state = reducer(state, { type: 'tab/results', tabId: 't1', results: find });
    expect(state.tabData.t1.findResults).toEqual(find);
    const next: FindResult = { documents: [{ b: 2 }], truncated: true };
    state = reducer(state, { type: 'tab/results', tabId: 't1', results: next });
    expect(state.tabData.t1.findResults).toEqual(next);
  });

  it('tab/query patches the query and tab/loading, tab/errored, tab/errorCleared update the tab data', () => {
    let state = stateWithTabs([makeTab('t1')]);
    state = reducer(state, { type: 'tab/query', tabId: 't1', patch: { text: 'find({a: 1})', limit: '5' } });
    expect(state.tabData.t1.query.text).toBe('find({a: 1})');
    expect(state.tabData.t1.query.limit).toBe('5');
    expect(state.tabData.t1.query.skip).toBe('0');
    state = reducer(state, { type: 'tab/loading', tabId: 't1', loading: true });
    expect(state.tabData.t1.loading).toBe(true);
    state = reducer(state, { type: 'tab/errored', tabId: 't1', error: 'boom' });
    expect(state.tabData.t1.error).toBe('boom');
    state = reducer(state, { type: 'tab/errorCleared', tabId: 't1' });
    expect(state.tabData.t1.error).toBeUndefined();
  });

  it('tab/card stores a card, tab/results clears it, and tab/read records the last read text', () => {
    let state = stateWithTabs([makeTab('t1')]);
    expect(state.tabData.t1.card).toBeUndefined();
    expect(state.tabData.t1.lastRead).toBeUndefined();

    state = reducer(state, { type: 'tab/card', tabId: 't1', card: { kind: 'count', count: 7 } });
    expect(state.tabData.t1.card).toEqual({ kind: 'count', count: 7 });

    state = reducer(state, {
      type: 'tab/card',
      tabId: 't1',
      card: {
        kind: 'write',
        op: 'updateMany',
        matched: 3,
        modified: 3,
        deleted: 0,
        inserted: 0,
        insertedId: null
      }
    });
    expect(state.tabData.t1.card).toMatchObject({ kind: 'write', op: 'updateMany', matched: 3 });

    state = reducer(state, {
      type: 'tab/read',
      tabId: 't1',
      text: 'db.getCollection("coll").find({})'
    });
    expect(state.tabData.t1.lastRead).toBe('db.getCollection("coll").find({})');

    const results: FindResult = { documents: [{ a: 1 }], truncated: false };
    state = reducer(state, { type: 'tab/results', tabId: 't1', results });
    expect(state.tabData.t1.findResults).toEqual(results);
    expect(state.tabData.t1.card).toBeUndefined();
    expect(state.tabData.t1.lastRead).toBe('db.getCollection("coll").find({})');
  });

  it('tab/errored keeps the card and lastRead intact', () => {
    let state = stateWithTabs([makeTab('t1')]);
    state = reducer(state, { type: 'tab/card', tabId: 't1', card: { kind: 'count', count: 2 } });
    state = reducer(state, { type: 'tab/read', tabId: 't1', text: 'countDocuments()' });
    state = reducer(state, { type: 'tab/errored', tabId: 't1', error: 'boom' });
    expect(state.tabData.t1.error).toBe('boom');
    expect(state.tabData.t1.card).toEqual({ kind: 'count', count: 2 });
    expect(state.tabData.t1.lastRead).toBe('countDocuments()');
  });

  it('tab/pinned sets and clears the pinned flag', () => {
    let state = stateWithTabs([makeTab('a'), makeTab('b')]);
    state = reducer(state, { type: 'tab/pinned', tabId: 'a', pinned: true });
    expect(state.tabs.find((t) => t.id === 'a')?.pinned).toBe(true);
    expect(state.tabs.find((t) => t.id === 'b')?.pinned).toBeUndefined();
    state = reducer(state, { type: 'tab/pinned', tabId: 'a', pinned: false });
    expect(state.tabs.find((t) => t.id === 'a')?.pinned).toBe(false);
  });

  it('tab/retitled updates the tab title and leaves others untouched', () => {
    let state = stateWithTabs([makeTab('a'), makeTab('b')]);
    state = reducer(state, { type: 'tab/retitled', tabId: 'b', title: 'renamed' });
    expect(state.tabs.find((t) => t.id === 'a')?.title).toBe('db.coll');
    expect(state.tabs.find((t) => t.id === 'b')?.title).toBe('renamed');
  });

  it('tab/reordered moves a tab before and after a target', () => {
    let state = stateWithTabs([makeTab('a'), makeTab('b'), makeTab('c'), makeTab('d')]);
    state = reducer(state, { type: 'tab/reordered', tabId: 'd', targetId: 'b', position: 'before' });
    expect(state.tabs.map((t) => t.id)).toEqual(['a', 'd', 'b', 'c']);
    state = reducer(state, { type: 'tab/reordered', tabId: 'd', targetId: 'b', position: 'after' });
    expect(state.tabs.map((t) => t.id)).toEqual(['a', 'b', 'd', 'c']);
    state = reducer(state, { type: 'tab/reordered', tabId: 'a', targetId: 'c', position: 'after' });
    expect(state.tabs.map((t) => t.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('tab/reordered ignores self drops and unknown ids', () => {
    const state = stateWithTabs([makeTab('a'), makeTab('b')]);
    const self = reducer(state, { type: 'tab/reordered', tabId: 'a', targetId: 'a', position: 'before' });
    expect(self.tabs.map((t) => t.id)).toEqual(['a', 'b']);
    const unknown = reducer(state, {
      type: 'tab/reordered',
      tabId: 'a',
      targetId: 'zzz',
      position: 'before'
    });
    expect(unknown.tabs.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('reducer connection actions', () => {
  it('connections/upserted adds then replaces by id', () => {
    let state = reducer(initialState, { type: 'connections/loaded', connections: [makeConnection('c1')] });
    state = reducer(state, { type: 'connections/upserted', connection: makeConnection('c2') });
    expect(state.connections.map((c) => c.id)).toEqual(['c1', 'c2']);
    const renamed: ConnectionConfig = { ...makeConnection('c1'), name: 'Renamed' };
    state = reducer(state, { type: 'connections/upserted', connection: renamed });
    expect(state.connections.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(state.connections[0].name).toBe('Renamed');
  });

  it('connections/removed drops session, tabs and tabData and fixes activeTabId', () => {
    let state = stateWithTabs([makeTab('t1', 'c1'), makeTab('t2', 'c2'), makeTab('t3', 'c1')]);
    const connected: SessionState = { ...emptySession(), status: 'connected', databases: ['db'] };
    state = {
      ...state,
      connections: [makeConnection('c1'), makeConnection('c2')],
      sessions: { c1: connected, c2: emptySession() }
    };
    state = reducer(state, { type: 'tab/activated', tabId: 't3' });
    state = reducer(state, { type: 'connections/removed', id: 'c1' });
    expect(state.connections.map((c) => c.id)).toEqual(['c2']);
    expect(state.sessions.c1).toBeUndefined();
    expect(state.sessions.c2).toEqual(emptySession());
    expect(state.tabs.map((t) => t.id)).toEqual(['t2']);
    expect(state.tabData.t1).toBeUndefined();
    expect(state.tabData.t3).toBeUndefined();
    expect(state.tabData.t2).toBeDefined();
    expect(state.activeTabId).toBe('t2');
  });

  it('connections/removed keeps activeTabId when it belongs to another connection', () => {
    let state = stateWithTabs([makeTab('t1', 'c1'), makeTab('t2', 'c2')]);
    state = reducer(state, { type: 'tab/activated', tabId: 't2' });
    state = reducer(state, { type: 'connections/removed', id: 'c1' });
    expect(state.activeTabId).toBe('t2');
    expect(state.tabs.map((t) => t.id)).toEqual(['t2']);
  });
});

describe('reducer session actions', () => {
  it('session lifecycle transitions', () => {
    let state = reducer(initialState, { type: 'session/connecting', connectionId: 'c1' });
    expect(state.sessions.c1.status).toBe('connecting');
    state = reducer(state, { type: 'session/connected', connectionId: 'c1', databases: ['a', 'b'] });
    expect(state.sessions.c1.status).toBe('connected');
    expect(state.sessions.c1.databases).toEqual(['a', 'b']);
    expect(state.sessions.c1.error).toBeUndefined();
    state = reducer(state, { type: 'session/errored', connectionId: 'c1', error: 'nope' });
    expect(state.sessions.c1.status).toBe('error');
    expect(state.sessions.c1.error).toBe('nope');
    state = reducer(state, { type: 'session/disconnected', connectionId: 'c1' });
    expect(state.sessions.c1).toEqual(emptySession());
  });

  it('session/expand toggles the database entry', () => {
    let state = reducer(initialState, { type: 'session/connected', connectionId: 'c1', databases: ['a', 'b'] });
    state = reducer(state, { type: 'session/expand', connectionId: 'c1', database: 'a' });
    expect(state.sessions.c1.expanded.a).toBe(true);
    expect(state.sessions.c1.expanded.b).toBeUndefined();
    state = reducer(state, { type: 'session/expand', connectionId: 'c1', database: 'a' });
    expect(state.sessions.c1.expanded.a).toBe(false);
  });

  it('session/collections stores collections per database', () => {
    let state = reducer(initialState, { type: 'session/connecting', connectionId: 'c1' });
    state = reducer(state, {
      type: 'session/collections',
      connectionId: 'c1',
      database: 'db',
      collections: ['users', 'orders']
    });
    expect(state.sessions.c1.collections.db).toEqual(['users', 'orders']);
  });
});

describe('reducer settings actions', () => {
  it('settings/loaded replaces settings and settings/patched merges a partial', () => {
    const loaded = { ...DEFAULT_SETTINGS, theme: 'dark' as const, maxTimeMs: 10000, defaultLimit: 10 };
    let state = reducer(initialState, {
      type: 'settings/loaded',
      settings: loaded
    });
    expect(state.settings).toEqual(loaded);
    state = reducer(state, { type: 'settings/patched', patch: { theme: 'light' } });
    expect(state.settings).toEqual({ ...loaded, theme: 'light' });
  });
});
