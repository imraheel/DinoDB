# NexDB

A fast, native-feeling MongoDB desktop client for macOS and Windows. Built with Electron, React, and TypeScript, with hard process isolation so one slow query can never freeze the app.

Every collection tab runs in its own forked worker process with a hard timeout, so the UI and other tabs stay fully responsive even when a query hangs.

## Features

- **Connections** — save multiple connections with full auth support (SCRAM, X.509, AWS, GSSAPI, PLAIN), test before saving, stored locally in SQLite
- **Shell-style query editor** — Monaco editor with `find`, `findOne`, `countDocuments`, `aggregate`, and full write ops; `ObjectId`/`ISODate` stubs converted to Extended JSON; multi-statement scripts with run-at-cursor (⌘⏎) or run-all
- **Explain** — run `explain("executionStats")` from the toolbar or with `.explain()` syntax, shown in a collapsible plan tree
- **Document CRUD** — insert, edit, and delete documents with live JSON validation
- **Schema-aware results** — columns inferred from your data; Extended JSON rendered readably; pagination with first/prev/next/last and skip/limit
- **Collections sidebar** — databases → collections tree; create, rename, duplicate, drop, and clear collections
- **Tabs** — pin, rename, drag-to-reorder, close others; clipped tabs collected in an overflow menu
- **Settings** — dark/light/system theme, query timeout, default row limit

## Supported Platforms

| Platform                          | Artifact                |
| --------------------------------- | ----------------------- |
| macOS 12+ (Intel & Apple Silicon) | `.dmg`, `.zip`          |
| Windows 10/11 (x64)               | NSIS installer (`.exe`) |
| Linux                             | Planned                 |

## Download

Grab the latest build from the [Releases](https://github.com/imraheel/mongo-client/releases) page.

## Development

| Command            | Description                        |
| ------------------ | ---------------------------------- |
| `pnpm install`     | Install dependencies               |
| `pnpm dev`         | Launch the app with hot reload     |
| `pnpm test`        | Run unit tests                     |
| `pnpm typecheck`   | Type-check all TypeScript projects |
| `pnpm build`       | Production build                   |
| `pnpm clean`       | Remove `dist/` and `out/`          |
| `pnpm package:mac` | Build macOS installers             |
| `pnpm package:win` | Build Windows installer (x64)      |
| `pnpm package:all` | Build for macOS and Windows        |

To cut a release, push a tag — CI builds both platforms and publishes a GitHub Release with the installers attached:

```
git tag v0.2.0 && git push origin v0.2.0
```

## License

Licensed under the [GNU General Public License v3.0](LICENSE).
