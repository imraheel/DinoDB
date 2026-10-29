# DinoDB

A fast, native-feeling MongoDB desktop client for macOS and Windows. Built with Electron, React, and TypeScript, with hard process isolation so one slow query can never freeze the app.

Every collection tab runs in its own forked worker process with a hard timeout, so the UI and other tabs stay fully responsive even when a query hangs.

## Features

- **Connections** — save multiple connections with full auth support (SCRAM, X.509, AWS, GSSAPI, PLAIN), test before saving, stored locally in SQLite
- **Shell-style query editor** — Monaco editor with `find`, `findOne`, `countDocuments`, `aggregate`, and full write ops; `ObjectId`/`ISODate` stubs converted to Extended JSON; multi-statement scripts with run-at-cursor (⌘⏎) or run-all
- **Explain** — run `explain("executionStats")` from the toolbar or with `.explain()` syntax, shown in a collapsible plan tree
- **Document CRUD** — insert, edit, and delete documents with live JSON validation
- **Schema-aware results** — columns inferred from your data; Extended JSON rendered readably; pagination with first/prev/next/last and skip/limit
- **Collections sidebar** — databases → collections tree; create, rename, duplicate, drop, and clear collections
- **Import/export** — BSON, Extended JSON, Simple JSON and CSV; export selected rows, all query results or a whole collection. Simple JSON and CSV use readable values; BSON and Extended JSON preserve MongoDB types. Dedicated transfer tabs show progress and cancellation, with each operation running in its own Electron utility process.
- **Database backup/restore** — use locally installed or user-selected MongoDB Database Tools to back up a database to an archive, or restore an archive/dump directory, with progress and cancellation in a separate tab.
- **Tabs** — pin, rename, drag-to-reorder, close others; clipped tabs collected in an overflow menu
- **Settings** — dark/light/system theme, query timeout, default row limit

## Database backup and restore

Install [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools) 100.3.0 or later. Open **Preferences → Database Tools** to test automatic detection or browse to `mongodump` and `mongorestore` separately. A configured path takes precedence; Reset to automatic restores installed-tool discovery. Only the tool needed for the chosen operation is required. No tools are bundled or downloaded by the app.

For an extracted tools download, select the actual executables inside its `bin` folder: `bin/mongodump` and `bin/mongorestore` on macOS, or `bin/mongodump.exe` and `bin/mongorestore.exe` on Windows. Select each file separately, use **Test tools** to check its version and required capabilities, then save Preferences to apply the paths. These choices are saved locally. Clearing a custom path enables automatic discovery through PATH and common installation directories. An invalid custom path is reported directly so another installed version is not silently substituted. Apps launched from Finder may have a different PATH from your terminal; choosing the executable explicitly avoids that dependency.

Right-click a database and choose **Back Up Database…** or **Restore Database…**. Backup creates a MongoDB archive, optionally compressed with gzip. Restore accepts an archive or dump directory and requires the original database name plus a destination name. For directory input, choose the dump root or a database directory whose name matches the original database. Select gzip only when the source files were compressed.

Restore defaults to a new database. Inserting into existing collections stops on errors. Replacing backed-up collections requires confirmation and leaves unrelated collections intact. Cancelling or failing a restore does not undo changes already made. Database-only backups are not point-in-time snapshots while external applications continue writing. Tool/server compatibility and authentication support depend on the selected Database Tools release.

Automated tests use isolated executable fixtures to verify process execution, cancellation and failures without a live server. Backup and restore have also been manually verified in the application. Real executable validation and PATH discovery were verified on macOS Intel with MongoDB Database Tools 100.20.0.

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
