# Changelog

All notable changes to NexDB are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.5-alpha] - 2026-10-17

First pre-release. No installer artifacts were published for the intermediate 0.1.4 build; all changes below ship together in this alpha.

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
