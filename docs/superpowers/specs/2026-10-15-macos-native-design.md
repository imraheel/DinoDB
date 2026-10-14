# NexDB macOS-Native Redesign — Design Spec

**Date:** 2026-10-15
**Status:** Approved
**Scope:** Presentational redesign of NexDB to faithfully match native macOS (Sequoia-era) application design — window chrome, palette, buttons, popups, menus, and typography. No behavioral or IPC changes.

## Goals

- Faithful HIG replica: the app should be hard to distinguish from a native macOS app (Finder/Xcode/System Settings family).
- Full native chrome: hidden inset title bar with traffic lights over a translucent vibrancy sidebar.
- macOS system blue (`#007AFF` / dark `#0A84FF`) replaces emerald as the accent; green survives only as success/status indicator.
- Both light and dark themes fully polished; system-following theme mode keeps working.
- Non-macOS platforms (Windows/Linux) receive the same tokens, primitives, and accent, with the standard window frame (all native-chrome code darwin-gated).

## Non-goals

- No new features, no layout restructuring beyond the title-bar integration.
- No changes to IPC, sessions, tabs, CRUD, SQLite, or utility processes.
- No new runtime dependencies (no component libraries); Tailwind v4 + React only.
- No custom accent-color settings.

## Current-state problems (addressed by this design)

- Colors hard-coded as slate/emerald Tailwind utilities inline in all 15 tsx files; ~130 duplicated `dark:` pairs; no CSS variables or `@theme` (`src/renderer/src/styles.css`).
- No shared UI primitives: 6 modals re-implement the same overlay/panel pattern; 4 context menus duplicate the same constants (`Sidebar.tsx:33-37`, `DataTable.tsx:79-84`, `ManageConnectionsPopup.tsx:24-28`); 10+ copy-pasted button class strings with inconsistent hover directions and radii.
- Zero animations (2 `transition-colors` uses in the whole renderer).
- Stock window: no `titleBarStyle`, no vibrancy, hardcoded dark flash color `backgroundColor: '#0f172a'` (`src/main/window.ts:21`).
- Monaco uses stock `vs`/`vs-dark` themes, visually disconnected from app chrome (`src/renderer/src/lib/monaco.ts:218-221`).

## 1. Design tokens & palette

Tailwind v4 CSS-first tokens: a `@theme` block in `src/renderer/src/styles.css`. Components consume semantic utilities (`bg-surface`, `text-text-secondary`, `border-border`, `text-accent`, …). Dark mode re-declares the same custom properties under the existing `.dark` scope (`@custom-variant dark` stays). Result: one source of truth, no per-component `dark:` duplication.

| Token | Light | Dark |
| --- | --- | --- |
| `--color-accent` | `#007AFF` | `#0A84FF` |
| `--color-accent-hover` | `#0066D6` | `#2690FF` |
| `--color-accent-active` | `#0055B3` | `#48A0FF` |
| `--color-accent-ring` | `rgba(0,122,255,0.35)` | `rgba(10,132,255,0.4)` |
| `--color-bg` (window content) | `#FFFFFF` | `#1E1E1E` |
| `--color-surface` (panels, content) | `#FFFFFF` | `#252528` |
| `--color-surface-raised` (modals, menus) | `#FFFFFF` | `#2C2C2E` |
| `--color-chrome` (tab strip, headers, toolbars) | `#F4F4F5` | `#2A2A2D` |
| `--color-sidebar` (translucent base under vibrancy) | `rgba(246,246,248,0.72)` | `rgba(40,40,44,0.65)` |
| `--color-border` (hairline) | `rgba(0,0,0,0.10)` | `rgba(255,255,255,0.10)` |
| `--color-text-primary` | `#1D1D1F` | `#F5F5F7` |
| `--color-text-secondary` | `rgba(60,60,67,0.78)` | `rgba(235,235,245,0.65)` |
| `--color-text-tertiary` | `rgba(60,60,67,0.48)` | `rgba(235,235,245,0.38)` |
| `--color-danger` | `#FF3B30` | `#FF453A` |
| `--color-danger-soft` (banner bg) | `rgba(255,59,48,0.08)` | `rgba(255,69,58,0.12)` |
| `--color-success` | `#34C759` | `#30D158` |

Typography: system SF stack (unchanged `-apple-system` base). Sizes normalized: 13px body/sidebar, 12px secondary/controls, 11px captions, 10px shortcut hints. Weights: regular default, medium for emphasis, semibold for titles only.

## 2. Window chrome & app shell

`src/main/window.ts` (darwin-gated):

- `titleBarStyle: 'hiddenInset'`
- `trafficLightPosition: { x: 12, y: 12 }`
- `vibrancy: 'sidebar'`
- Theme-aware `backgroundColor` (light `#FFFFFF` / dark `#1E1E1E`), replacing hardcoded `#0f172a`; eliminates pre-load flash mismatch.

App shell (`App.tsx`, `Sidebar.tsx`, `TabBar.tsx`) becomes one unified 36px top strip:

- Sidebar header gets `padding-left: 70px` so traffic lights float over the vibrancy sidebar (Finder-style); brand + "Connect" sit right of the lights.
- Top strips use `-webkit-app-region: drag`; buttons, the sidebar resize handle, and interactive chrome use `no-drag`.
- Tab strip in the main column aligns to the same 36px height; empty tab-bar area is draggable.
- Modal overlays are full-window (`fixed inset-0`) and cover traffic lights while open — accepted.
- Windows/Linux: no `titleBarStyle`/vibrancy; standard frame retained.

## 3. Shared UI primitives

New folder: `src/renderer/src/components/ui/`.

### Button (`Button.tsx`)

- Variants: `primary` (accent fill, white text, 6px radius; hover accent-hover; active accent-active + subtle inner shadow), `default` (neutral gray-gradient fill + hairline border — macOS Cancel look), `quiet` (transparent, hover wash), `destructive` (danger fill).
- Sizes: `sm` (22px), `md` (28px); label 12px medium.
- Focus-visible: 3px accent-ring outline. Disabled: 40% opacity.

### Modal (`Modal.tsx`)

- Overlay: `fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px]`.
- Panel: `rounded-[10px] bg-surface-raised border border-border` + layered macOS-style shadow.
- Slots: header (15px semibold title + close), body (scrollable), footer (right-aligned actions, hairline divider).
- Animation: enter fade + scale 0.96→1 @ 150ms ease-out; exit fade @ 100ms.
- `alert` variant (ConfirmDialog/PromptDialog): compact ~280px, right-aligned button pair, destructive/primary on the right (macOS alert convention).
- Used by all 6 dialogs: ConnectionModal, SettingsModal, DocumentModal, ManageConnectionsPopup, PromptDialog, ConfirmDialog.

### Menu (`Menu.tsx`)

- One context-menu component replacing the 4 duplicated implementations.
- Panel: `rounded-[6px] bg-surface-raised border border-border shadow-lg py-1`; 13px items.
- Item hover/selection: full-width accent pill (`rounded-[4px]`, 4px side margins), white text; danger items danger-colored.
- Hairline separators; optional right-aligned 10px shortcut column. Fade-in 100ms.

### Input (`Input.tsx`)

- 26px height, `rounded-[5px]`, surface fill, hairline border, accent focus ring; also exports the framed-container style for Monaco boxes.

### SegmentedControl (`SegmentedControl.tsx`)

- NSSegmentedControl look: recessed `bg-chrome` track + hairline `rounded-[7px]`; selected segment raised (`bg-surface-raised` + inner shadow light); 12px labels.

### Banner (`Banner.tsx`)

- Error/success strips (Sidebar, TabWorkspace): soft danger-soft/success tinted bg, hairline, 12px text, dismiss ✕.

## 4. Component restyling map

- **Sidebar** — vibrancy bg; 13px text; Finder-style disclosure triangles replace chevron SVGs; selected db/collection = full-width accent pill (white text); connection rows with success status dot; hairline right border; resize handle accent/40 hover.
- **TabBar** — Safari-style tabs: active `bg-surface`, top-rounded, no bottom border (merges into content); inactive `bg-chrome`, 12px secondary labels; close ✕ fades in on hover; strip `bg-chrome` + hairline bottom.
- **QueryBar** — "Run" as fully-rounded accent pill with `⌘↵` kbd hint chip; number inputs in Input frame; Monaco in framed container; hairline bottom.
- **DataTable / ResultCard** — `bg-chrome` sticky header, 11px semibold labels; hairline row borders; hover wash; selected row = accent bg + white text; selected-cell accent outline; palette-tuned type colors (strings green-ish, numbers orange, booleans purple); mono 12px cells.
- **WelcomeScreen** — 22px semibold title, 13px subtitle; accent-tinted step badges; recent cards hairline + accent hover; shortcuts panel chrome/60 + hairline; kbd chips mono 10px; footer 11px tertiary.
- **All modals** — via Modal/Input/Button primitives; theme picker via SegmentedControl.
- **Monaco** — register custom light/dark themes mapped to tokens; `setMonacoTheme` switches; stock themes kept as fallback.
- **Scrollbars** — thin overlay kept; thumb `rgba(128,128,128,0.4)`, hover `0.55`.

## 5. Motion, platform handling, error handling, risks

**Motion:** hover/active 120ms ease; modal fade+scale 150ms/exit 100ms; menu fade-in 100ms; tab switch instant; focus-visible rings everywhere; disabled 40% opacity.

**Platform handling:** native-chrome code darwin-gated; Windows/Linux get tokens/primitives/blue accent with standard frame.

**Error handling:** logic unchanged; banners via Banner; `window.confirm` (`Sidebar.tsx:123`) routes through ConfirmDialog alert variant.

**Risks & mitigations:** vibrancy is macOS-only (darwin-gate; no-op elsewhere); app-region drag regions vs resize handle (explicit no-drag); packaged-app vibrancy verification via `package:dir`; large mechanical diff (primitives first, then per-cluster conversion, typecheck/tests after each).

## 6. Verification plan

1. `pnpm typecheck` and `pnpm test` pass.
2. Manual `pnpm dev` in light/dark/system: chrome, traffic lights, vibrancy sidebar, all 6 modals, context menus, tab switching, table selection, Run button, welcome screen, live theme switch.
3. Min window (960×600): traffic lights never overlap sidebar content; sidebar resize works.
4. `pnpm package:dir` smoke test: packaged app shows vibrancy, theme persists.

## File-change inventory (expected)

- `src/renderer/src/styles.css` — `@theme` tokens, dark overrides, keyframes, type scale.
- `src/main/window.ts` — darwin native chrome.
- New: `src/renderer/src/components/ui/{Button,Modal,Menu,Input,SegmentedControl,Banner}.tsx`.
- Reworked: all 13 components + `App.tsx`; `src/renderer/src/lib/monaco.ts` (custom themes).
- Untouched: main IPC/services, utility process, shared types, preload, logic tests.
