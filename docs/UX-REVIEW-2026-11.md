# Sheet UX, interaction and save-path review — November 2, 2026 (v0.7.0)

All mutation testing ran against a SQLite copy of the complete workspace (11,444-row budget included) served on port 4318. The live database on port 4317 was only read (`GET /api/state`, `GET /api/version`) for before/after comparison. A consistent online-API backup was taken before any work: `backups/before-ux-review-1793661885/fs-sheet.sqlite` (integrity check `ok`, revision 32).

## 1. Add column from the header strip

- A **＋** button sits in the top-left corner cell of the grid header, the far-left of the column-header strip. It is sticky on both axes, so it stays visible while scrolling in any direction, and it scales with zoom. The select-all checkbox moved to the row-number header, matching Excel's corner position.
- The column editor (`public/column-editor.mjs`) groups all 41 types (Common, Text & choices, People & time, Links & relationships, Automatic & calculated). It shows a one-line explanation per type and only the settings that apply to the chosen type: choices for dropdowns, prefix/digits for auto-number, currency, mirror and progress sources. The formula and width settings are collapsible.
- **Insert position** lists "After “Column”" for every column. The default is after the active cell's column, or the end of the sheet when no cell is active. Nothing can be inserted before the primary column, because the hierarchy and row titles depend on it staying first. Name defaults to a unique "New column", pre-selected for typing.
- Header type glyphs now reflect real types and imported numeric formats (`#`, `$`, `%`), not a generic `T`.
- Verified on the budget copy: keyboard-only creation (Tab to ＋, Enter, type a name, arrow-select a type, Enter). Also verified: insertion after “Total Cost”, persistence across reload, undo, redo, the duplicate-name error, and the button staying fixed after scrolling 2,000 px right and 600 px down. An API test covers persistence across a server restart plus undo and redo of the insertion.

## 2. Editing speed and the save queue (largest functional finding)

Measured on the full workspace copy (33.7 MB state, budget sheet 21 MB):

| Step | Before | After |
|---|---|---|
| Server time per save | ~2.4 s | ~0.85 s |
| Enter → cursor on next cell after an edit | ~1.8 s (blocked on save) | ~60 ms |
| Four consecutive cell entries (type + Enter) | 7.7 s | 0.9 s |
| 20 × ArrowDown | ~1.3 s | 77 ms |

Causes and fixes:

- `normalizeMetadata`, `collectMentions` and `runWorkflows` looked up each row in the previous state with a linear `find`, which is O(rows²): 1.5 s on 11,444 rows. They now use Maps, with identical semantics.
- `save()` stringified the workspace for a size check, stringified the old state again for history, re-read and re-parsed the state after writing, and stringified it again for the response. It now serializes once, stores the old state's existing text in history, and returns the serialized text directly. Validation, revision checks, lock checks, metadata, mentions and workflows are unchanged.
- `render()` called `history.replaceState` on every render, which cost about 580 ms per edit in Chrome on this page. It now runs only when the URL changes.
- Uploading 33 MB blocked the UI thread for about 0.4 s. Workspace saves are now serialized and uploaded by a Web Worker (`public/save-worker.js`), with the same request, headers and body.
- Edits are **optimistic and queued** (`public/edit-queue.mjs`). The grid shows the last server-confirmed state plus every pending edit immediately, and saves remain strictly serialized. Each save is rebuilt on the latest confirmed server state, so server-added metadata, activity and automation results are never overwritten by a stale client copy.
  - Rejected saves (validation, locks) disappear from the display.
  - A 409 conflict blocks the rest of the queue and keeps the existing "save unsaved draft / load latest" banner.
  - Undo and redo run in order after pending saves. Their result becomes the new confirmed base, so a queued edit cannot resurrect an undone change.
  - Edits that create ids keep the same ids when replayed, so you can edit a newly added row before it has saved.
  - The status shows "Saving…" while work is pending, and closing the tab with pending saves prompts first.
- `visibleRows()` is memoized per render. `moveGrid()` no longer re-renders the whole app when the target cell is on the current page.

Verified in the browser on the copy: four rapid entries display immediately and persist in order; a stale-tab save is rejected with the conflict banner and nothing is overwritten; edit → undo → edit leaves the undone value undone. Unit tests cover ordering, metadata preservation, id replay, rejection, conflict blocking, partial-failure rollback and undo interleaving.

## 3. Spreadsheet interactions

- **Shift-click range selection was broken** on cells with editors: a capture handler focused the cell before the range handler ran, resetting the anchor. Fixed. A 2×3 shift-click range now copies correctly.
- **Excel clipboard interoperability**: copying puts computed display values on the clipboard as TSV plus an HTML table. Excel no longer receives internal `=[Col]@row` or `CELLREF(…)` syntax. Pasting inside the app still carries formulas and translates relative references. Pasting Excel values `1,234`, `$5.50`, `(2,000)` and `12%` parses to 1234, 5.5, −2000 and 0.12.
- **Enter/Space on column-header buttons** activated grid navigation instead of the button whenever a cell was selected. Fixed. Column menus also closed instantly when opened by keyboard, because a scroll event fired as the header came into view. Fixed. Arrow keys skipped every other column-menu item because two menu handlers responded. Fixed.
- Right-clicking a cell no longer leaves its raw value (`2975`) showing instead of the formatted value (`2,975`).
- Floating-point noise is hidden at display time (Excel's 15 significant digits: `5000000.000000003` → `5000000`). Stored values and calculations are unchanged.
- Checked and working: arrow, Tab and Enter navigation; F2, Escape and Enter editing; ⌘Z undo; column resize by pointer with undo; the date picker on the schedule sheet; zoom at 80%, 100% and 150% (header and ＋ scale, sticky headers hold).

## 4. Formulas and conditional formatting

- **Grid reference picking**: while a cell formula is being edited, or while the ƒx Formulas drawer has focus, clicking a cell inserts `[Column]@row` for the same row or `[Column]N` for another row. Shift-click grows the last reference into a range (`[Column]3:[Column]9`), and clicking a column title inserts `[Column]:[Column]`. A comma or `+` is inserted automatically when the caret follows another operand. The picked cell gets a dashed outline. The formula drawer is now non-modal so the sheet stays clickable; Escape closes it.
- Imported formulas that use stable `CELLREF("@row","<id>")` references now show a **Reads as** line in the drawer preview, with column names and row numbers. This is display only; the stored formula is never rewritten.
- Rule priority, enable/pause, duplicate/delete, row vs. selected-column scope and live match counts were reviewed and left as they were. The rule-drawer footer now sits at the bottom edge.

## 5. Interface consistency (monochrome preserved)

- The sheet heading and toolbar are about 34 px shorter, showing more rows on laptop screens. Toolbar controls share 32 px height, radius and spacing. Focus rings use one charcoal style across toolbar, menus and grid.
- The Format popover is reorganized into labeled groups (Text, Layout, Style) with a "Format rules…" link. The duplicate Undo, Summary and Automations entries are removed; they remain in the main toolbar and More tools. Indent and Outdent now work on the current cell selection, not only on checked rows.
- Row tools (attachments, comments, proofs, lock) appear on hover or keyboard focus, or when a row has items. Previously every row showed four gray icons.
- Narrow windows (≤760 px) wrap the command bar onto a second line instead of clipping "More tools".
- No colored chrome was introduced. Cell colors, imported workbook formatting (such as the schedule sheet's green rows) and error values are untouched.

## Budget accuracy evidence

Recomputing all **18,835** formula cells in the 11,444-row budget with the shared engine reproduces their audited source values (`budgetSource`): 18,835 match, 0 mismatches, 0 error values (half-cent tolerance; 1e-9 for percentages). The formula engine and import audit metadata were not modified. Ambiguous financial values flagged by the import review were left as they were.

## Tests

`npm test`: 238 passing, 0 failing (216 before this work). New suites: `column-editor`, `edit-queue`, `formula-picker` and `save-path`, plus a clipboard interop case in `grid-clipboard`.

## 6. Follow-up: remaining risks addressed (v0.8.0)

**Field-level patch saves (`lib/state-patch.mjs`, `POST /api/patch`).** The browser no longer uploads the whole workspace. It sends only the changed fields: individual cells, row fields, added/removed rows and sheets, sheet properties and order changes, each with its before and after value. The server applies the patch to its current state and then runs the unchanged `save()` pipeline (full validation, lock enforcement, metadata, mentions, workflows). It answers with its own field-level changes, applied to the confirmed state. A response is a few KB instead of 33 MB.

| On the 11,444-row budget copy | v0.7 | v0.8 |
|---|---|---|
| Upload / response per edit | 33 MB / 33 MB | < 1 KB / < 20 KB |
| Undo history per step | full 33 MB snapshot | reverse patch, usually < 5 KB |
| Server time per save | ~0.85 s | ~0.5 s |
| Enter → next cell | ~60 ms | ~36 ms |
| Four rapid entries fully saved | ~6 s | ~2.8 s |

**Concurrent tabs now merge instead of being blocked.** A patch from a tab with an older revision is applied when every field it changes is still at the value that tab saw, so edits to different cells, even in the same row, merge. The saving tab receives the merged workspace ("Saved and merged with changes from another tab"), and idle tabs load other tabs' saves automatically every few seconds. A real conflict is refused with 409 and the conflict banner, and nothing is overwritten: the same cell edited differently, a row edited in one tab and deleted in another, or concurrent column-definition changes. Verified with two browser tabs on the budget copy.

**Undo history stores reverse patches.** Snapshot rows written by v0.6/v0.7 still undo correctly (`kind` column, default `state`). Undo/redo use a restoring apply mode, so a drifted field cannot leave undo permanently stuck. Session ownership, redo invalidation and the 50-step limit are unchanged.

**Virtualized grid instead of 50-row pages.** About 120 rows are rendered at a time, with spacer rows sized from measured row heights. Scrolling swaps only the table body. Keyboard movement, ⌘↑/⌘↓ and selection slide the window, and the footer shows the live visible range. **Go to row** (⌘G) now takes the row number shown in the grid and says so when that row is hidden by a filter or collapsed parent.

**Keyboard point mode for formulas.** While editing a cell formula, when the caret follows `=`, an operator, `(` or `,`, the arrow keys pick a cell reference and keep moving it. Shift+arrow extends it into a range, and typing anything else leaves point mode. After an operand, arrows move the caret as before.

**Formula drawer beside the sheet.** On windows at least 900 px wide, the sheet narrows to sit beside the open ƒx drawer, so every column can be clicked to insert references. The active cell is scrolled into view.

**Fixed along the way:** `GET /api/state` could return stored text missing the `dashboards`/`feedback`/`testing` defaults that the server applies in memory. It now always matches the server's state.

Tests: 248 passing. New: `state-patch` (300 randomized round-trips; merge, conflict, idempotence and malformed-patch cases), patch API integration (fast path, stale-tab merge, conflict, legacy snapshot undo, multi-tab undo ownership, restart), point-mode helpers.

## Remaining limitations and risks

- The workspace is still stored as one SQLite row, so each save rewrites the ~33 MB state text (~140 ms write plus ~100 ms serialization of the server's ~0.5 s). Nothing waits on it any more, and transfers and history are small. A per-row storage schema would remove it; that is a data migration and was not done.
- Merging is field-level: two tabs changing the **same** cell, the same column definition, or the same sheet setting still conflict, by design. There is no automatic resolution UI beyond the draft download and reload.
- Virtual scrolling estimates spacer heights from the rendered rows. With text wrap and very uneven row heights, the scrollbar can shift slightly as rows render. Printing prints the rendered window, not every row.
- Keyboard point mode works in inline cell editing; in the ƒx drawer, references are picked with the mouse.
- Row numbers are stable identifiers; imported rows whose children precede their parent still display out of numeric order.
- Local, single-machine use only, with no accounts or permissions (out of scope for now). **This is not evidence of enterprise readiness.**
