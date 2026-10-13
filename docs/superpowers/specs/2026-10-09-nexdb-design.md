# NexDB — Design Spec

A RoboMongo-style desktop MongoDB client built with Electron + React.

**Product name:** NexDB (package `nexdb`, productName `NexDB`, SQLite file `nexdb.db`)

**Status:** Approved (2026-10-09)

## Goals

- Store and manage multiple MongoDB connections in a local SQLite database.
- Open multiple collections in multiple tabs, RoboMongo-style.
- Full isolation: every tab's MongoDB work runs in its own Electron `UtilityProcess`, so a stuck query/tab never blocks other tabs or the main process.
- Full CRUD, a shell-style query editor, schema inference.
- Cross-platform (macOS, Windows, Linux).
- pnpm, minimal dependencies.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Platform | macOS, Windows, Linux |
| Tab isolation | `utilityProcess.fork()` — one utility process per open tab (plus one per connection session for the sidebar tree) |
| MongoDB features (v1) | Full CRUD + schema inference |
| Index Manager, Explain Plan | Deferred to **V2** |
| UI | React + Tailwind CSS (no component library) |
| State management | React Context + `useReducer` (no state library) |
| Connection storage | SQLite via `better-sqlite3` (synchronous) |
| Secrets | Stored **unencrypted** in SQLite (master-password encryption deferred) |
| Schema inference | Sample first **50** documents per collection |
| Aggregation / count | Deferred — to return as QueryBar functionality (`countDocuments` + aggregation pipelines); Monaco `mongodb` language + completions kept for it |
| Data view | Table view only (tree/JSON views V2) |
| Auth | Full mechanism support: default SCRAM (username/password), `MONGODB-X509`, `MONGODB-AWS`, `GSSAPI` (Kerberos), `PLAIN` (LDAP) — expressed via `authMechanism`, `authSource`, `authMechanismProperties`, plus free-form `extraOptions` URI params |
| Themes | Light / Dark / System toggle, persisted in SQLite settings |
| Not in scope (v1) | SSH tunnel, SSL/TLS UI, connection import/export, query history & favorites, virtualized tables |

## Architecture

```
┌──────────────────────────── Main process ─────────────────────────────┐
│  ipcMain handlers ── repos (better-sqlite3) ── settings/connections   │
│  SessionManager  ── UtilityClient (one per connected connection)      │
│  TabManager      ── UtilityClient (one per open tab)                  │
└───────────────┬───────────────────────────────────┬───────────────────┘
                │ UtilityProcess (MessagePort)      │ ipcRenderer.invoke
                ▼                                   ▼
┌───────────────────────────┐        ┌─────────────────────────────────┐
│ Utility process (session) │        │ Renderer (React, single window) │
│  mongodb driver:          │        │  Sidebar: connections + tree    │
│  listDatabases/           │        │  TabBar + TabWorkspace:         │
│  listCollections          │        │  QueryBar (Monaco), DataTable,  │
└───────────────────────────┘        │  DocumentModal (Monaco),        │
┌───────────────────────────┐        │  ConnectionModal, SettingsModal │
│ Utility process (tab #N)  │        │  Context + useReducer state     │
│  find/insert/             │◄──────►│  preload contextBridge API      │
│  replace/delete/inferSchema│       └─────────────────────────────────┘
└───────────────────────────┘
```

Key rules:

1. **Renderer never touches MongoDB or SQLite.** It only calls the preload API (`window.api.*`), which uses `ipcRenderer.invoke`.
2. **Main never executes MongoDB queries.** It relays requests to the owning `UtilityClient` with a correlation id and a hard timeout (`maxTimeMs + 5000`), so a stuck query can never wedge the main process — the pending promise always settles.
3. **One `UtilityProcess` per tab.** Each tab owns its own `MongoClient` (its own connection pool). Killing/closing a tab kills only that process.
4. **One `UtilityProcess` per connection session** powers the sidebar database/collection tree, so tree operations are isolated too.
5. **Data crossing process boundaries is relaxed Extended JSON (plain JSON-safe objects).** Utility serializes with `EJSON.serialize(doc, { relaxed: true })` and deserializes inbound payloads with `EJSON.deserialize(value, { relaxed: true })`. Unknown `$` keys (query operators, pipeline stages) pass through untouched — verified behavior of the bundled `bson` package.

## Process & IPC protocol

- Main → utility: `{ kind: 'init', init: InitMessage }` then `{ kind: 'request', id, request, maxTimeMs }`.
- Utility → main: `{ kind: 'ready' }` (after `MongoClient.connect()` succeeds), `{ kind: 'response', id, ok, result | error }`, `{ kind: 'fatal', error }`.
- `start()` resolves on `ready`, rejects on `fatal`/timeout/exit. `request()` resolves/rejects per correlation id, always bounded by a timeout.

## Feature specification (v1)

### Connection manager
- SQLite table `connections` with discrete fields (name, host, port, auth fields, default database, extra options, timestamps). URI built at runtime by `buildMongoUri()`.
- CRUD from sidebar; "Test" button runs a throwaway utility process ping (10s timeout) and reports server version.
- Deleting a connection kills its session process and all tab processes.

### Tab system
- Clicking a collection in the tree calls `tabs:create` → main forks a utility process, connects, runs schema inference (50 docs), returns `{ tabId, fields }`.
- Tab strip: titles `db.collection`, close buttons, active-tab tracking, neighbor selection on close.
- Per-tab state (query text, results, errors) lives in the renderer reducer and survives tab switches.

### Query & CRUD
- QueryBar: Monaco editor for a shell-style query (`db.getCollection("c").find(filter, projection).sort(...).skip(...).limit(...)`, with `ObjectId`/`ISODate`/`Date` stubs → Extended JSON) + skip + limit inputs (limit clamped 1..1000; chained `.skip()`/`.limit()` override the inputs), `Cmd/Ctrl+Enter` runs.
- Table: columns = union of schema top-level fields and result keys; cells render relaxed EJSON in human form (`$oid` → hex, `$date` → ISO); row actions Edit / Delete; toolbar Insert Document.
- Document editor modal: Monaco, JSON-validated; writes go through `insertOne` / `replaceOne` (target = original `_id`) / `deleteOne`; results refresh via re-run.

### Aggregation (planned)
- Not exposed in the UI currently; will return as QueryBar functionality (`countDocuments` + aggregation pipelines).
- The Monaco `mongodb` language (Monarch tokenizer) and its completion provider (pipeline stages, operators, inferred field paths) are kept in `lib/monaco.ts` for that return.

### Settings & theme
- SQLite `settings` key/value table: `theme` (light/dark/system), `maxTimeMs` (default 30000), `defaultLimit` (default 50).
- Theme applied via `document.documentElement.classList.toggle('dark')` + Tailwind custom dark variant; Monaco theme follows.

## Project structure

```
mongo-client/
├── package.json                 # pnpm; no "type" field → CJS main/preload/utility
├── electron.vite.config.mts     # main + preload + renderer build (ESM config)
├── tsconfig.node.json           # main/preload/shared typecheck (noEmit)
├── tsconfig.web.json            # renderer typecheck (noEmit)
├── tsconfig.utility.json        # utility+shared → out/ (CommonJS emit)
├── vitest.config.ts
├── electron-builder.yml
├── scripts/run-tests.mjs        # vitest under ELECTRON_RUN_AS_NODE (native ABI)
├── src/
│   ├── shared/                  # types.ts, ipc.ts, mongo-uri.ts, validate.ts
│   ├── main/                    # index, window, db/, services/, ipc/
│   ├── preload/index.ts         # contextBridge → window.api
│   ├── utility/                 # index.ts, operations.ts, schema.ts
│   └── renderer/                # React app (src/{components,context,lib})
└── docs/superpowers/            # this spec + implementation plan
```

## Dependencies (minimal)

Runtime (`dependencies`): `better-sqlite3`, `mongodb`.
Renderer/tooling (`devDependencies`, bundled by Vite): `electron`, `electron-vite`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `react`, `react-dom`, `monaco-editor`, `typescript`, `electron-builder`, `vitest`, `@types/*`.

Notably **absent**: ORM, state library, component library, test-component library, eslint (deferred), SSH/TLS libs.

## Tooling notes

- Build: `electron-vite` (chosen over Electron Forge — simpler config, first-class externalization of native deps, single config for all three process types). Output: `out/{main,preload,renderer}`; utility compiled by `tsc -p tsconfig.utility.json` to `out/utility` (CommonJS, `mongodb` resolved from `node_modules`).
- `postinstall`: `electron-builder install-app-deps` rebuilds `better-sqlite3` for Electron's ABI.
- Tests run via `scripts/run-tests.mjs`, which executes vitest under `ELECTRON_RUN_AS_NODE=1` so native `better-sqlite3` tests share the same ABI as the app.
- Packaging: `electron-builder` with `asarUnpack` for `out/utility/**` and `node_modules/better-sqlite3/**`; utility script path rewrites `app.asar` → `app.asar.unpacked` when packaged.

## Error handling

- Shared `validateConnection()` returns error strings (renderer pre-validates, main re-validates).
- All IPC handlers throw `Error`; renderer catches and surfaces via reducer `tab/errored`, `session/errored`, or modal banners.
- Utility process failures: `fatal` during init → `start()` rejects; `exit` mid-flight → all pending requests reject with "Utility process exited".
- Query timeout: mongo-level `maxTimeMS` + IPC-level timeout (`maxTimeMs + 5000`).

## V2 backlog

Index Manager, Explain Plan, SSH tunnel, SSL/TLS options, connection import/export, query history & favorites, tree/JSON document views, virtualized table for large result sets, aggregation visual builder, auto-reconnect for dropped sessions.
