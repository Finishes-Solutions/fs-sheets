# Requested feature coverage

Updated November 2, 2026. This ledger describes the implemented local application, not certification of feature parity with either vendor's entire service.

| Request | Where to test | Implemented behavior |
| --- | --- | --- |
| Lock beside proofing | Fourth sticky row-tool icon | Lock/unlock persists; server protects locked cells, hierarchy, formula exception overrides, and calculated-column definitions. Comments/files remain usable. |
| Conditional coloring / format rules | Conditional formatting | Ordered, scoped conditions, enable/pause, duplicate/reorder/delete. Fill, text color, bold, italic, underline/strike, wrapping, alignment, font size. |
| Sorting | Sort | Three-key hierarchy-aware sibling sorts, dropdown order, blanks last. |
| Formulas | Formulas / Formula audit | 131 function names, named columns and A1 ranges, relative fill-down, absolute references, cross-sheet evaluation, business calendars, hierarchy, previews, inferred-rule evidence, restoration controls. See FORMULAS.md for supported forms and limits. |
| Requests | Requests / Inbox | Local update/approval requests, selected fields, assigned tester labels, responses, cancellation/history. |
| Sheet automations | Automations | Change/new-row/date triggers, AND/OR conditions, ordered cell-write/lock/request/inbox actions, pause/edit/delete, counters and date deduplication. DataTable-created records participate in new-row workflows. |
| Filtering | Filter | Saved AND/OR filters, row properties, dates, parent inclusion; active view retained per browser. |
| Column visibility | Columns | Show/hide, reorder, width, type and formula editing. Hidden columns retain data and calculations. |
| Comment tags | Row comments / People / Inbox | Name chips, mention completion, persisted mention records and local inbox delivery. |
| Core and Monday-style columns | Columns → Add column | 41 choices: text, long text, numbers, currency, percent, date/date-time, checkbox, status/dropdown, multi-select, contact, people, symbols, item ID, auto-number, timeline, connected rows, link, location, email, phone, rating, tags, duration, audit fields, formula, files, latest comment, mirror, dependencies, timer, world clock, country, color, votes, button, week and progress. Mirrors calculate over linked source rows; progress tracks chosen checkboxes; timers store start/pause intervals. Names/votes are local labels. |
| Dependency planning | Dependencies & baseline | FS/SS/FF/SF, signed working-day lag, custom weekend/holidays, preview/apply, cycle/unresolved-reference/lock checks, baseline capture. Current starts are lower bounds; summary parents remain unchanged. |
| Portfolios | Portfolios | Multi-sheet leaf-row cost/status/due-date rollups with per-sheet field mappings, source drilldown, persisted definitions. |
| Scenario planning | Scenario planning | Cell overrides, recalculated comparisons, project include/exclude, priorities, budget/effort limits, priority-first recommendation, alternatives, guarded application to live source cells. Recommendation is a heuristic, not an optimal resource solver. |
| DataTables | DataTables | Source snapshots, CSV append/replace/keyed upsert, filters, explicit field mapping, merge/append/update sheet connections, automatic synchronization on saves, locked-row skipping, idempotent keyed updates, status/errors and materialization into independent sheets. |
| Dynamic View | Dynamic View | Field selection, editable/required fields, conditional hidden/read-only/required rules, row filters, comments, server-projected reads and validated edits. The full local project API is still available to local clients; this is not authenticated private sharing. |
| Excel migration | Overview → Import → Excel/ZIP | Direct workbook/archive conversion and additive import, duplicate-source detection, size/revision checks, raw source upload retention. Native conversion requires Python and the pinned requirements-excel.txt packages. |
| Supplied exports | Imported Smartsheet exports workspace | Three sheets, 3,681 rows, 203,085 cell positions, 754 mapped comments, 37 retained unmapped comment records, widths, hidden columns, inferred hierarchy, fills/font colors/font families/font sizes, borders, alignments and wrapping. Nine inferred column formulas, 15 literal exceptions. |

## Import evidence

The supplied workbooks contain zero formula definitions and zero conditional-format rules. Their static values/styles were copied; nine new rules were inferred from matching values and labeled as inferred. Original formulas, unavailable automation definitions, actual attachment/proof files, vendor identities/permissions, and missing conditional rules cannot be reconstructed exactly from these exports. Uncertain financial/duplicate/approval logic is not silently guessed. The source ZIP and pre-change backups remain available.

The final persisted project was compared with the converted source bundle: all 203,085 source cell positions and all 754 mapped comment texts match. The audit identified one previously damaged Unicode text value; it was restored from the source, and request decoding now preserves characters across network chunk boundaries. A regression test covers split UTF-8 input. All 13,953 cells governed by the nine inferred column formulas retain their export outputs at the reference date, including the 15 explicit exceptions. Archive age intentionally advances with TODAY.

## Working with DataTables

A source-backed table can refresh from its source while automatically syncing mapped values into another sheet. Importing CSV into that table turns off automatic source refresh so the imported records are not overwritten; target connections continue syncing. Explicit **Refresh from source** restores the source snapshot. Keyed ingestion preserves unspecified fields, rejects duplicate/empty keys, and validates types before changing records. Connections never delete target rows. The local limit is 10,000 rows per table/sheet and 64 MB per project save, including embedded data/files; this is not Smartsheet's hosted large-scale storage service.

## Verification

Automated tests exercise formulas, typed values, mirrors/progress, scheduling, baseline capture, locks, filters, formatting, reports/dashboards, requests/mentions/workflows, keyed ingestion/connections, projected view edits and required fields, scenario conflicts, Unicode decoding, and persistence across server restarts. Chromium checks exercise planning creation, per-view editing/rules, budget/capacity selection, field mapping and CSV merge into a connected target, voting/timer controls, native upload of the actual supplied ZIP, formula preview/recalculation/fill-down, locks and imported-sheet pagination.

## Research and boundaries

The official Smartsheet Python SDK was inspected at commit `e32cef3c7faeba30a4cec37f9ac15b5a1d72cc83`:

- [Column type model](https://github.com/smartsheet-platform/smartsheet-python-sdk/blob/e32cef3c7faeba30a4cec37f9ac15b5a1d72cc83/smartsheet/models/enums/column_type.py): dates/date-times, contacts, picklists, durations and predecessors.
- [System column types](https://github.com/smartsheet-platform/smartsheet-python-sdk/blob/e32cef3c7faeba30a4cec37f9ac15b5a1d72cc83/smartsheet/models/enums/system_column_type.py): automatic IDs and creation/modification fields.
- [Row model](https://github.com/smartsheet-platform/smartsheet-python-sdk/blob/e32cef3c7faeba30a4cec37f9ac15b5a1d72cc83/smartsheet/models/row.py): row locks.
- [Project settings](https://github.com/smartsheet-platform/smartsheet-python-sdk/blob/e32cef3c7faeba30a4cec37f9ac15b5a1d72cc83/smartsheet/models/project_settings.py): working and non-working days.

This verifies the published model vocabulary, not identical vendor runtime behavior. The environment proxy denied access to `help.smartsheet.com` and `support.monday.com`; their allowed domains were saved in the environment draft, but those pages were not successfully retrieved. No official feature-by-feature verification of the premium apps or Monday's complete catalog is claimed.

Authenticated accounts/private sharing, verified user identity, external email/push, concurrent cell merging, cloud connectors, optimal resource management, full vendor function/coercion compatibility, and all premium-service behavior remain outside the tested local implementation. These require separate production infrastructure and compatibility work. The app remains bound to loopback.

## Finding the features after publication

Overview now lists sheets across all workspaces, with an imported-sheet callout and search. A fresh browser selects the workspace containing imported sheets; valid saved workspace preferences are preserved. Opening a sheet from the global library switches its workspace context as well. The current published data contains three imported sheets in **Imported Smartsheet exports** and one sample sheet in **Finishes Studio**.

The **Planning & Data** navigation group opens Portfolios, Scenario planning, DataTables, and Dynamic View. These tools have setup forms; no saved configurations were created merely to populate their pages. Empty states show the available source workspace and a Create action. Each sheet now has File, Edit, View, Insert, Format, Automate, and Data menus above its views and toolbar. The workspace picker and planning links remain visible on phone layouts.

This navigation update was checked at desktop and 390 px phone widths, including opening every planning setup form and the sheet formatting, column and workflow dialogs. The project revision and full persisted data checksum were unchanged by the UI update. Nothing was reimported or published as part of that update.

## Planning workspaces and document exports (0.6)

A permanent six-destination feature bar now appears above the content on desktop and phone screens. Portfolios and Scenario planning show actual-source previews immediately; no dummy saved definitions or fabricated business records are created. Saved definitions have a library and dedicated detail workspace. Direct hash routes restore the workspace and selected item.

Added suggested name-based mappings (including imported field punctuation), progress-aware completion, project cards, scenario comparison, safe bulk percentage/fixed/date adjustments with a preview, source-first setup galleries, and searchable paginated DataTable/Dynamic View records. Fixed DataTable configuration so a rename no longer overwrites merged records with a fresh source snapshot.

Reports now have mapped live source presets and a standalone local PDF endpoint. PDF documents contain full filtered results and calculated values, source and generation metadata, optional notes/summary, repeated headers, row numbers, and page totals; Letter/A4 and portrait/landscape are supported. Wide reports continue in column sections and long cells continue on later pages. Export does not save or change project data. CSV remains a separate action.

Browser verification uses a separate SQLite copy for saved portfolios, bulk scenario previews, duplication/constraints, DataTable CSV ingestion/rename/search/pagination, Dynamic View configuration/edits, saved mapped report filtering, PDF download, and reload/deep-link persistence. Read-only checks use the actual imported workspace at port 4317. This update does not import sheets again or publish the environment.
