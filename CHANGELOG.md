# Changelog

All notable changes to DinoDB are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.10-alpha] - 2026-11-22

### Added

- Open in Shell collection action with dedicated Mongosh script tabs, Monaco editor, console output, Run/Stop controls, elapsed status and execution timeouts
- Independent shell processes with private connection bootstrap files, redacted/bounded console output, cancellation and cleanup on tab close, disconnect, connection removal or application quit
- Platform-specific bundled `mongodump`, `mongorestore` and `mongosh` executables, verified against pinned SHA-256 hashes, with upstream license/third-party notices and installer architecture checks; optional proprietary encryption libraries are excluded
- Mongosh executable selection and validation in Database Tools preferences, with custom-path, bundled and installed-tool discovery
- File menu Close Tab command (`Cmd+W` on macOS, `Ctrl+W` on Windows/Linux)
- `Cmd+Shift+/` / `Ctrl+Shift+/` toggles a block comment in the query and Mongosh script editors
- Toggle sidebar (`Cmd+B` / `Ctrl+B`) and Close window shortcuts listed in the Keymap preferences
- Collapsible connections in the sidebar, using the expand arrow or a double-click on the connection name
- Connection context menu with Expand/Collapse, Refresh, Copy name, Add database, Edit connection and Disconnect
- Add database dialog that creates the database together with its first collection
- DinoDB Lite installers without bundled MongoDB tools, built with `pnpm package:lite` (plus `:mac`, `:win` and `:all` variants) and published alongside the full installers in releases

### Changed

- Automatic MongoDB tool discovery prefers bundled executables before installed tools; explicit user overrides retain precedence
- Mac tool bundles use Mongosh 2.5.10 for macOS 12 compatibility; Windows/Linux bundles use Mongosh 2.14.1
- Keymap preferences show shortcuts for the current platform: macOS symbols (`⌘ ⇧ C`) on Mac and `Ctrl+Shift+C` style labels on Windows/Linux, including platform-specific developer tools and delete-document keys
- Close window moved to `Cmd+Shift+W` / `Ctrl+Shift+W`
- The sidebar Disconnect button appears only while hovering over or keyboard-focusing the connection header
- Connections without databases stay visible in the sidebar when no search filter is active
- electron-builder configuration moved from `electron-builder.yml` to `electron-builder.cjs`, with `electron-builder.lite.cjs` for Lite builds
- The project pins pnpm 11 through the `packageManager` field, and the release workflow uses it instead of pnpm 10
- The development setup downloads the Electron binary in a `postinstall` step, since Electron 43 no longer does this during install

### Fixed

- `Cmd+W` / `Ctrl+W` closed the whole window instead of the active tab
- Zoom in did not respond to `Cmd+=` / `Ctrl+=` without Shift
- Quit had no keyboard shortcut on Windows/Linux; it now uses `Ctrl+Q`
- Toggle sidebar on macOS also responded to `Ctrl+B`; it now uses only `Cmd+B`
- `pnpm dev` failed with "Electron uninstall" after a fresh install

## [0.1.9-alpha] - 2026-10-29

### Added

- New dinosaur app icon for macOS, Windows, and Linux, with matching renderer icons, favicons, and vector artwork
- Light and dark app screenshot and a contributor guide covering setup, checks, and pull requests

### Changed

- Rebranded the application to DinoDB across the interface, menus, package metadata, and installer identity (`com.dinodb.app`)
- DinoDB now uses a fresh `dinodb.db` in its new application data directory
- Updated the README with the new branding, screenshot, highlights, supported platforms, GitHub Releases download link, source build instructions, contribution guidance, license, and DMCA notice

## [0.1.8-alpha] - 2026-10-27

### Added

- Collection import and export in BSON, Extended JSON, Simple JSON, and CSV formats, available from collection context menus
- Export controls before Insert Document in the data table, supporting selected rows or all results from the query beyond the displayed page
- Dedicated import/export tabs with progress and cancellation; each operation runs in a separate Electron utility process to keep the main process and other tabs responsive
- Whole-database backup and restore through locally installed or user-selected `mongodump` and `mongorestore`, available from database context menus
- Database archive backups with optional gzip compression; restore from archives, dump roots, or named database directories, with source database selection and destination renaming
- Restore modes for a new database, inserting into an existing database, or replacing backed-up collections with confirmation while preserving unrelated collections
- Dedicated database operation tabs with progress, elapsed time, diagnostic logs, cancellation, and partial-restore status
- Database Tools preferences with independent executable paths, Browse, Test tools, automatic installed-tool discovery, and version/capability validation; tools are supplied separately
- Restore preflight checks, per-database import/restore write locks, protected temporary connection credentials, and cleanup of owned processes and temporary files on cancellation, disconnect, tab close, or application quit

### Changed

- CSV exports use readable BSON values such as ObjectId hex strings and ISO dates; Simple JSON provides readable values recursively, while BSON and Extended JSON retain MongoDB type information
- Database Tools downloads appear as a selectable URL with a Copy URL button and copied feedback in Preferences
- Database Tools now appears above Advance Settings in the settings sidebar with a dedicated database backup icon
- Added Oxlint and Oxfmt scripts and applied lint fixes and consistent formatting across the codebase

### Fixed

- Blocked renderer-created popup windows, page navigation, and redirects so external links cannot open inside the application

## [0.1.7-alpha] - 2026-10-22

### Added

- Collection index manager — dedicated index tabs listing each index's key pattern, properties, and usage; create, drop, hide/unhide actions with context menus; open via "View Indexes" on a collection in the sidebar
- `createIndex(key, options?)` queries in the query bar, with editor autocompletion and a confirmation card on success
- VS Code–style titlebar — Connect button, settings gear, centered tab title, and macOS traffic-light spacing
- Sidebar collapse/expand from the titlebar (panel icon or ⌘B / Ctrl+B)
- Sidebar search to filter databases and collections
- About menu (macOS)
- Multi-row selection in the result table with bulk delete and copy
- Confirmation when disconnecting a connection that has open tabs — the connection's tabs are closed on confirm

### Changed

- Index usage shows the absolute operation count with the stats start date (e.g. `1,546,806 since 2026-08-04`)
- Index properties displayed as compact labels (Unique, Sparse, TTL, Compacting)
- Connect button moved from the sidebar into the titlebar; the sidebar now starts at search
- App icon and settings popup refreshed

## [0.1.6-alpha] - 2026-10-17

First pre-release. Supersedes the `v0.1.5-alpha` tag, whose Windows CI build failed; no release should be taken from that tag.

### Added

- Query explain with `executionStats` verbosity — Explain button in the query bar or `.explain()` query syntax, results shown in a collapsible plan tree
- Multi-statement scripts — run the query at the cursor (⌘⏎) or the entire script; statements split on top-level `db.` lines
- Tab management — pin, rename, close other tabs, drag-to-reorder, overflow menu for clipped tabs
- Windows builds — NSIS x64 installer alongside existing macOS DMG/ZIP
- `package:mac`, `package:win`, `package:all`, and `clean` scripts

### Changed

- Monaco line (`⌘/`) and block (`⌘⇧/`) comment toggling now work in the query editor
- License changed from MIT to GNU GPL v3.0

## [0.1.0] - 2026-10-09

### Added

- Initial release — saved connections with full auth support, databases/collections sidebar, multi-tab workspace, shell-style query editor, full document CRUD, schema-aware result table, settings with dark/light/system themes, and per-tab process isolation with hard query timeouts
