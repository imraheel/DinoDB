# Changelog

All notable changes to NexDB are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
