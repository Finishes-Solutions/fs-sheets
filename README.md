# sheets

A local sheets and planning application. Version 0.6 adds permanent feature navigation, live portfolio previews, scenario comparison and bulk adjustments, searchable DataTables and Dynamic Views, and downloadable report PDFs. The existing imported sheets, formula engine, 41 column types, formatting, requests, and local workflows remain available. Full Smartsheet/Excel service and formula parity is still a broader compatibility effort.

## Run

Requires Node.js 24 or newer with `node:sqlite`. Run `npm ci` to install the pinned PDF renderer. Reports are generated locally without an external service.

```sh
git clone https://github.com/Finishes-Solutions/fs-sheets.git
cd fs-sheets
npm ci
npm run dev
```

For an existing checkout, run `npm ci` after pulling dependency changes, then `npm run dev` from its project folder. `npm run dev` restarts the server when its imported code changes; refresh the browser after frontend edits. For a server without file watching, use `npm start`.

Open http://127.0.0.1:4317. Keep the terminal running. Stop with Ctrl+C. Set `PORT` to change the port. Set `DB_PATH` to use a different SQLite file.

## Working features

- Workspaces and folders; create, rename, move sheets between folders, duplicate sheets.
- 41 column types, including multi-select, symbols, stable item IDs, auto-number, people, timeline ranges, connected sheet rows, links, location, currency/percent/rating, audit fields, files, and latest comment. Specialized editors preserve structured values.
- Editable table; typed multi-cell paste; search, saved AND/OR filters with row properties and parent context; three-key sibling sorting; row hierarchy and collapse. Blanks sort last and dropdowns use option order.
- Column and cell formulas with a preview editor and reference insertion; arithmetic, comparisons, 34 functions, ranges, hierarchy, and cross-sheet references. Sheet summary fields support values and formulas.
- Manual cell/row/column formatting, text wrap, style copying, and ordered conditional formatting rules with row/column scope, enable/pause, duplicate, and delete.
- Board with draggable cards and configurable lanes; month calendar and date-range Gantt/timeline with field mappings.
- Saved column visibility, widths, and order; rounded monochrome interface with keyboard search (⌘K / Ctrl+K).
- Saved reports with source selection, AND/OR conditions, selected columns, grouping, sorting, leaf-row scope, CSV and paginated PDF exports, mapped fields across different source schemas, and editable source details.
- Saved dashboards with status/date/owner/metric mappings, configurable panels, completion, status mix, workload, upcoming due dates, and source drilldown.
- Local intake forms with selected fields and required-field rules that append rows to their destination sheet.
- Test lab with a persistent checklist, feedback, status tracking, and tester labels.
- Workflows with cell-change, row-added and date triggers, AND/OR conditions, and ordered actions: change cell, lock row, create update/approval request, or notify a local inbox. Date rules are checked every minute while the server runs.
- Local update/approval requests with selected fields, recipient responses, cancellation and history. Local people directory, comment mention chips and per-name inboxes.
- Left-side row controls for paperclip attachments, comments, proofing, and locking; the controls stay visible during horizontal scrolling.
- Server-enforced row locks protect cells and hierarchy from edits, deletion, paste, board moves, and automation writes. Unlock separately before editing; comments and attachments remain available. Locks prevent accidental changes, not access by an authenticated role.
- Dedicated row panels with comment threads and downloadable attachments (2 MB per file).
- Local proofs from new uploads or existing attachments, file-version history, review comments, assigned reviewer labels, approvals, and change requests. New versions start fresh reviews; prior decisions remain visible. Raster images preview inline; other formats download for native inspection.
- CSV import/export; JSON backup/restore; print; activity history; 50-step undo.
- SQLite persistence, atomic writes, revision checks, change polling, downloadable conflicting drafts, and session-scoped undo protection.

The included “Studio launch plan” is illustrative sample data, not information imported from a Smartsheet account.

## Formula examples

```text
=[Budget]@row - [Spent]@row
=IF([Status]@row = "Complete", 1, 0)
=SUM([Budget]1:[Budget]10)
=SUM(CHILDREN())
=SUM({Other sheet::Budget})
```

Cross-sheet references use `{Sheet name::Column name}`. References are currently name-based: renaming a referenced column or sheet requires updating formulas. Functions are implemented independently and are not certified Smartsheet equivalents. Invalid or unsupported formulas return explicit error values. See `lib/formulas.mjs` and the in-app formula guide for the exact function set.

## Data and operating boundaries

The database is created at `data/fs-sheet.sqlite`, with SQLite journal files beside it. Use Export → Entire project for a portable backup. Close the server before copying the database directly. Use one running instance per local database. If your checkout lives in Dropbox or another synced folder, synchronization is not a database collaboration protocol.

The server listens only on `127.0.0.1`. This edition supports local testing, without account authentication or per-user permissions. Tester profiles label comments, feedback, and activity; they do not establish identity. Separate browser tabs can detect newer changes and reject stale saves, but cannot merge simultaneous edits. Undo is blocked when another tab made the latest change. Forms are usable locally, not public share links. Remote hosting requires authentication, authorization, proper attachment storage, and a concurrency model before deployment.

Application limits: 100 sheets, 100 columns per sheet, 10,000 rows per sheet, and 64 MB per project save. Those are validation bounds, not a performance guarantee; the table is not virtualized and the whole project is saved per edit. Attachments are embedded in project data and included in undo snapshots. Use small files during this phase.

## Verification

```sh
npm test
```

The automated test suite covers rich-cell validation, stable auto-numbers, locks, conditional formats, hierarchy sorting, mentions, request creation and date-workflow deduplication, as well as formulas and cycle errors, rejection of executable input, report filtering/grouping/sorting/CSV, dashboard aggregates, API persistence across restart, automation, optimistic concurrency, hierarchy validation, session-scoped undo, proof validation, version approvals, and proof persistence across restart. Integration tests bind a temporary loopback port and use disposable SQLite files.

Version 0.4 browser checks verified row lock/unlock, a timeline column and range, directory people, resolved mention delivery, conditional color and bold output, saved filters, formula preview/save, local update-request submission, and a cell-change workflow that locks a row. The sheet toolbar and sticky controls were reviewed at 1366 px. Earlier browser checks exercised inline edits and formulas, row-detail saves, grouped report creation, mapped dashboards, selected-field form submission, saved hidden columns and board lanes, feedback/checklist persistence, and the 390 px dashboard layout. Row tool placement, posting comments, creating proofs from existing attachments, recording changes/approvals, creating new versions, and historical approvals were also browser-tested. The automated file chooser was blocked by Chrome extension local-file permissions; new-file upload still needs manual verification. Drag-and-drop, attachment downloads, CSV round-trips, and all UI edge cases still need a broader regression suite.

## Project structure

- `server.mjs`: local HTTP API, validation, persistence, undo, automation.
- `lib/columns.mjs`: shared column catalog, typed validation and display values.
- `lib/sheet-tools.mjs`: filters, hierarchy-aware sorting, formats and lock checks.
- `lib/workflows.mjs`: metadata, mentions, local workflow execution and date deduplication.
- `lib/formulas.mjs`: shared formula parser and evaluator; no `eval`.
- `lib/proofs.mjs`: proof validation and reviewer status calculation.
- `lib/reporting.mjs`: shared report queries, aggregation, mapped fields, and CSV.
- `lib/report-pdf.mjs`: report document layout, embedded fonts, column sections and pagination.
- `lib/planning-workspace.mjs`: suggested mappings and safe bulk scenario adjustments.
- `assets/fonts/`: bundled DejaVu fonts and their redistribution license.
- `lib/seed.mjs`: initial sample workspace.
- `public/app.js`, `public/style.css`, `public/theme.css`: browser UI and interactions.
- `test/`: formula, reporting, and API tests.
- `docs/TESTING.md`: local team testing guide.
- `docs/PARITY.md`: capability ledger and implementation sequence.
- `docs/REA-FINDINGS.md`: initial static package inspection and evidence boundaries.
- `docs/LIVE-OBSERVATIONS.md`: sanitized first-pass observations from the running application and concrete feature gaps.

See [the v0.4 guide](docs/SHEET-TOOLS.md) for the new controls and exact limitations, and the parity ledger for the remaining work toward the requested full product.

If port 4317 is already in use, stop the existing sheets terminal with Ctrl+C before starting another instance. Keep only one server running against this project database.

## Portfolios and imported workbooks

Local portfolios, scenario planning, DataTable snapshots, and configurable Dynamic Views are available in the sidebar. See [Excel import and planning](docs/EXCEL-IMPORT.md) for workflows, the supplied workbook migration, and compatibility limits.

## Formula engine

The formula editor supports named-column and A1 references, lookups, multi-condition aggregates, custom workweeks, hierarchy functions, and relative fill-down. **Formula audit** explains inferred calculations and preserved exceptions in imported sheets. See [Formula capabilities and inference evidence](docs/FORMULAS.md) for examples, compatibility boundaries, and the nine installed inferred column formulas.

## Extended planning and native Excel upload

The sidebar includes connected DataTables, constrained scenario planning, portfolios with per-sheet mappings, and Dynamic Views with server-validated field rules. There are 41 column choices, including mirrors, dependencies, timers, votes, and progress tracking. Sheet tools include dependency scheduling and baseline capture.

For direct Excel/ZIP upload, install Python dependencies into the ignored local runtime directory:

```sh
python -m pip install --target data/python -r requirements-excel.txt
```

The server uses that directory for conversion. Node development and tests still use `npm run dev` and `npm test`. See [requested feature coverage](docs/REQUEST-COVERAGE.md) for the full test checklist, migration evidence, and compatibility boundaries.

## Planning and report PDFs (0.6)

The feature bar on every page opens **All sheets**, **Portfolios**, **Scenario planning**, **DataTables**, **Dynamic View**, and **Reports & PDFs**. Hash routes preserve the workspace and selected planning definition across reloads. The command search also finds planning destinations.

Portfolios immediately show a read-only live overview with suggested mappings from actual source names. Use **Save portfolio** to review source selection and mappings. Each project card is a sheet; overlapping sheets may represent the same project, so combined costs need review. Unmapped metrics are labeled.

Create a scenario to model cell changes, percentage or fixed cost adjustments, and calendar-day shifts. Bulk adjustments preview affected rows and skip parents, blank values, locked rows, and formula cells. Compare saved alternatives alongside their own live baselines; set budgets, priorities and capacity. Applying changes remains an explicit operation with source-value and lock checks.

DataTables and Dynamic View start with source-sheet cards. Saved views have search and 50-row pagination. Renaming a DataTable preserves ingested records and connections. Source refresh remains explicit; Dynamic View edits continue through server-enforced field rules.

Reports include live per-sheet presets, cross-sheet field mapping, conditions, grouping, sorting, and 100-row UI pages. **Export PDF** downloads a real PDF with selectable text, report metadata, optional summary and notes, repeated table headers, row numbers and page totals. Choose Letter/A4 and portrait/landscape, or uncheck detailed rows for a concise group summary. All matching rows and selected columns are exported, independent of UI pagination. Wide tables use additional column sections with the first column repeated; very long cells continue across pages. Files embed bundled DejaVu fonts (see `assets/fonts/LICENSE-DejaVu.txt`). CSV remains available separately.

## 0.7 — sheet UX and save speed

A **＋** at the far left of the column headers adds columns with a grouped type picker and insertion position. Edits appear immediately and save in an ordered background queue; on the 11,444-row budget, Enter moves to the next cell in about 60 ms instead of 1.8 s. Formulas can be built by clicking grid cells. Copying to Excel carries values, not internal formula syntax. Details, measurements and remaining limits: [docs/UX-REVIEW-2026-11.md](docs/UX-REVIEW-2026-11.md).
