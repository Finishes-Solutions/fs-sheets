# Budget workflow review — November 2, 2026

## Delivered

- Persistent undo and redo stacks, up to 50 steps, stored in SQLite. Each history transition moves the snapshot and updates the workspace in one transaction. New edits invalidate redo. Stale revisions and another session's history are rejected. History survives reload and server restart.
- A visible Redo toolbar button alongside Undo, with keyboard equivalents.
- Single click selects a cell; typing replaces it. Double-click or F2 opens its raw value/formula for editing. Arrows navigate selected cells and move the caret while editing. Enter/Tab commit and move; Shift reverses direction. Escape cancels. Clicking away commits even a one-character replacement, with duplicate-save protection.
- The Create (+) control and workspace-tree plus open an anchored menu: Sheet, Folder, Report, Dashboard, Form, Workspace. Outside click/Escape dismiss it; keyboard arrows navigate choices.
- Conditional formatting now uses a monochrome paint-bucket/drop icon.

## Validation

214 automated tests passed, including a new API test for three successive undo/redo steps, restart persistence, stale revisions, session ownership, empty redo, and branch invalidation.

UI mutation tests ran only on a SQLite backup of the complete budget database at localhost:4318. On the 11,444-row budget copy:

- Changed quantity 105840 → 105841: detail cost recalculated to $13,759,330 and project total to $20,985,080.
- Changed rate 130 → 131: project total recalculated to $21,090,921.
- Undid both edits; reloaded; redid both successfully.
- Verified Escape cancels, Enter moves down, Tab moves right, and F2 exposes raw numeric values.
- Verified a one-character click-away edit saved and required exactly one undo.
- Verified quoted multiline copy/paste round-trip, wrapping at 80% and 100%, and editing at 150%.
- Navigated by keyboard to the final page, rows 11401–11444.
- Verified the anchored creation menu and Folder action without submitting a creation on the live database.

The live budget object, including every row, formula, column and source-audit field, matches the pre-work backup exactly. A concurrent edit to a separate schedule sheet was preserved. See budget-data-preservation.json for the comparison hash.

These tests establish the listed workflows, not exact parity with every Smartsheet interaction or every browser/OS shortcut. OS-reserved key combinations may be intercepted before reaching the application. The application remains a local workspace with session-protected history, not authenticated multi-user collaboration.

## Update — v0.7.0 save queue

Edits now display immediately and save through a strictly serialized queue (`public/edit-queue.mjs`). Each save is rebuilt on the newest server-confirmed workspace, so revision checks, lock enforcement, metadata and workflows behave as before. Undo and redo wait for earlier saves; their results become the confirmed base for any edits queued after them. A rejected save is removed from the display; a 409 conflict stops the queue and shows the existing draft/reload banner. Server-side history semantics (50 persistent steps, session ownership, redo invalidation) are unchanged and covered by `test/history.test.mjs` and `test/save-path.test.mjs`. See [UX-REVIEW-2026-11.md](UX-REVIEW-2026-11.md).

## Update — v0.8.0 patch history

New history rows store a reverse patch (`kind='patch'`) instead of a full workspace snapshot; older snapshot rows still undo. Saves go through `POST /api/patch` and stale tabs merge when they changed different fields. See [UX-REVIEW-2026-11.md](UX-REVIEW-2026-11.md) §6.
