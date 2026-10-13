# NexDB

A fast, RoboMongo-style MongoDB desktop client built with Electron + React + Tailwind. Multiple saved connections, multi-tab collection browsing, full CRUD, and a shell-style query editor — with hard process isolation so one slow query can never freeze the app.

> Screenshot placeholder — `pnpm dev`, connect to a MongoDB instance, and open a couple of collection tabs.

## Why process isolation?

Most MongoDB clients run every query inside the main UI process (or a single worker). One accidental `{ $where: "sleep(30000); return true" }` freezes the whole app.

NexDB forks **one Electron `UtilityProcess` per collection tab** (plus one session process per connection for the sidebar tree). A stuck tab times out on its own (`maxTimeMs + 5s` hard cap enforced by the main process) while every other tab — and the UI — stays fully responsive.

```
┌────────────┐   IPC (correlation id + timeout)   ┌─────────────────────┐
│  Renderer  │ ◄────────────────────────────────► │  Main (orchestrator)│
│  (React)   │         contextBridge only         │  SQLite · managers  │
└────────────┘                                     └──────────┬──────────┘
                                                              │ utilityProcess.fork
                     ┌────────────────────────────────────────┼────────────────┐
                     ▼                    ▼                   ▼                ▼
               ┌──────────┐        ┌──────────┐        ┌──────────┐     ┌──────────┐
               │ session  │        │ tab #1   │        │ tab #2   │     │ tab #N   │
               │ (sidebar)│        │ find()   │        │ find()   │     │ find()   │
               └──────────┘        └──────────┘        └──────────┘     └──────────┘
```

The renderer never touches MongoDB, SQLite, or Node APIs — only a typed `window.api` preload bridge.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm install` | Install deps + rebuild native modules for Electron |
| `pnpm dev` | Build the utility worker, then launch the app with HMR |
| `pnpm typecheck` | `tsc --noEmit` across main, preload/shared, renderer, and utility configs |
| `pnpm test` | Unit tests (run inside Electron-as-Node so `better-sqlite3` matches the app ABI) |
| `pnpm build` | Production build of utility + main + preload + renderer into `out/` |
| `pnpm package` | Build + create installers (`dmg`/`zip` on macOS) into `dist/` |
| `pnpm package:dir` | Build + create an unpacked app directory (fast local smoke test) |

## Features (v1)

- **Connections** — CRUD with full auth support (SCRAM, X.509, AWS, GSSAPI, PLAIN via `authMechanism`, `authSource`, `authMechanismProperties`, plus free-form URI options). Stored in a local SQLite database (`nexdb.db` in the user-data dir).
- **Connection test** — ping + server version before saving.
- **Sidebar tree** — databases → collections, lazy-loaded per connection, one shared session process per connection.
- **Multi-tab workspace** — each opened collection gets its own tab and its own isolated worker process; results, query drafts, and errors are preserved per tab.
- **Query bar** — Monaco editor for shell-style queries: `find`, `findOne`, `countDocuments`, `updateOne`, `updateMany`, `replaceOne`, `deleteOne`, `deleteMany`, `insertOne`, `insertMany`, `aggregate` (under `db.getCollection("c")…`, with `ObjectId`/`ISODate` stubs → Extended JSON), skip/limit inputs, `Cmd/Ctrl+Enter` to run, 1000-row clamp, truncation hinting; count/write results show in a result card, and `Refresh` re-runs the last read.
- **CRUD** — insert, edit (replace), delete documents with Monaco JSON editing and live validation.
- **Schema-aware table** — column set inferred from a 50-document sample plus live keys; Extended JSON (`$oid`, `$date`, `$binary`, …) rendered readably.
- **Settings** — theme (Light / Dark / System with live OS-follow), query timeout, default row limit.

## Stack

Electron 43 · React 19 · Tailwind CSS v4 · Vite (electron-vite) · TypeScript strict · better-sqlite3 · official `mongodb` driver · Monaco. Minimal dependencies by design; no ORM, no state-management library, no CSS framework beyond Tailwind.

## Known constraints

- Connection passwords are stored **unencrypted** in `nexdb.db` (deliberate v1 trade-off; a master-password/keychain scheme is a candidate for V2).
- Table view only (no tree/JSON document views yet), no virtualized rows.

## V2 backlog

Index Manager, Explain plans, SSH tunneling, TLS UI, query history/favorites, import/export, tree/JSON document views, virtualized result tables. See `docs/superpowers/specs/2026-10-09-nexdb-design.md` for the full design and decisions.

## License

MIT
