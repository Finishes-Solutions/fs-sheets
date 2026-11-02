# Live Smartsheet inspection — first pass

Observed 2026-11-02 in the running macOS Smartsheet application. This document deliberately omits workspace names, record values, people, attachment names, and private asset URLs. It is safe to keep with the application source. Raw accessibility snapshots remain local and are excluded from Git.

## Evidence and limits

These are direct native-UI observations made through computer-use tools, not REA runtime Evidence. Earlier REA evidence covered the packaged Electron shell only. This pass inspected real hosted product UI inside that shell. Neither source inspection nor seeing a menu proves full behavioral compatibility.

No sheet cell, column definition, rule, workflow, form, or dashboard content was saved or modified. Navigation, view switching, selection, panel expansion and an unsaved dashboard editing session were used. The dashboard editor was exited with Cancel while Save was disabled. No messages, review invitations, notifications, or workflow executions were sent.

Local observation IDs correspond to numbered accessibility snapshots. These are ordinary observation IDs, not REA Evidence IDs. Raw records are not included in this repository because they contain business context.

## Observed requirements and current gaps

| Observation | Directly observed behavior | Current sheets gap | Evidence |
| --- | --- | --- | --- |
| Distinct views | The selector lists Table, Board, Timeline, Grid, Gantt, and Calendar. Switching from Table to Grid opens a distinct classic interface. | One editable table; Timeline and Gantt share one date-bar implementation. | 02, 13 |
| Column management | Searchable column list, shown/hidden state, drag handles, primary-column marker, keyboard visibility/selection controls. UI text says hidden Table columns also disappear from details panels across views. | Individual column dialogs and visibility settings; no unified manager. Current row details include hidden columns. | 03 |
| Filters | Saved-filter control, add-filter column picker, searchable columns, and a Row properties entry. | Sheet filtering only searches text and compares a field named Status. Reports have richer queries but sheet views do not. Filter operators and saved-filter lifecycle still need a bounded behavior test. | 04, 05 |
| Sort | Dedicated sort controls and an Add a sort picker. | One transient column/direction. Multiple-sort semantics and hierarchy behavior have not yet been tested in Smartsheet. | 06 |
| Cell formatting | Font, size, bold, italic, underline, strikethrough, text/fill colors, format painter and clear formatting are present. The live sheet visibly uses formatting. | No persisted cell/row formatting model or toolbar. | 01 |
| Conditional formatting | Rules have a priority order. An expanded rule shows a relative-date condition, add-condition control, selected-column formatting scope, formatting action, duplicate/delete, and enabled state. | No conditional formatting model or evaluation. No rule was changed in the original app. | 08, 09 |
| Formula editor | A dedicated panel offers Write syntax and Build with AI, formula syntax/description, selection guidance, and Apply. | Formulas button opens help; no equivalent editor/selection workflow. Formula compatibility and structural reference rewriting remain incomplete. | 07 |
| Sheet summary | Separate summary panel describes key information/metrics and summary rollups into reports; Add summary field entry. | Dashboard aggregates do not implement sheet summary fields. Field creation and formula semantics remain untested. | 10 |
| Scheduling settings | Shared cross-view date mappings, dependency and workload toggles, fiscal-year start, week start, working-day controls, hours per day, and holiday dates. UI explicitly says working days do not affect date calculations with dependencies off. | Date-field mapping only; no work calendar or dependency scheduler. Toggle effects were not exercised. | 11, 12 |
| Attachments | Classic Grid has Row, Sheet, and All scopes; sorting by upload time; selection/actions; row navigation; file-version indicator; attach-to-sheet entry. | Row-only attachments, no sheet scope, inventory, sorting, or attachment version model. | 13 |
| Proofing | Row and All scopes, file drop/create entry, file-link entry, action menu. No existing proofs were available in the inspected sheet. | Our local versions and review decisions are independently designed; they are not evidence of Smartsheet review parity. Annotation, invitations, and external-file review remain unverified. | 14, 15 |
| Automation | Manager has workflow filtering/sorting, execution status, trigger/action/recipient summary, last run/modified metadata, and templates for alerts, date reminders, row moves, and recurring update requests. | One cell-transition/set-cell rule is much narrower; no execution engine for these actions. Existing workflows were not run or edited. | 16, 17 |
| Forms | Create and Manage entry points; manager opened with no existing forms on the inspected sheet. | The current local field-selection implementation does not establish form-builder parity. Logic, design, distribution, and submission semantics need further inspection. | 18, 19 |
| Workspace contents | Folders contain reports alongside other asset types; sheets and dashboards are also workspace items. | One-level folders contain only sheets; other asset libraries are separate. | 01, 20 |
| Dashboard composition | Editor exposes themes, widget settings, canvas width, undo/redo, and Save/Cancel. Catalog includes Metric, Chart, Timeline, Report (optional Gantt), Title, Rich text, Image, Shortcut, and Web content. | Fixed panel dashboard is a subset; no general widget composition/layout model. | 20–22 |
| Report display | An existing report displays typed rows, wrapped text, row attachment indicators and side-panel tools. This inspection did not establish the report-definition editing workflow. | Current reports need row-level tool access and verified configuration semantics; report behavior remains only partially observed. | 23 |
| Dashboard data access | Existing report widgets display a source-unavailable state when their creator lacks the required source role. | Local edition has no permissions/source-ownership model. No access settings were changed or bypassed. | 20 |

## Scale finding from source audit

The current grid renders every row and editable cell, then replaces the app DOM after edits. The client clones and saves the whole project; the server stores whole-project snapshots. This is a prototype architecture, not a demonstrated equivalent for large operational sheets. Rendering limits, command-based edits, range selection, and targeted updates need explicit benchmarks before any scale claim.

## Next implementation order

1. Grid rendering and edit-state foundation, measured against a large synthetic sheet; preserve hierarchy and focused cells.
2. Real Columns manager, general saved sheet filters, durable sorting and row/cell selection.
3. Persisted formatting, ordered conditional rules, summary fields and formula editor.
4. Attachment/proof/conversation scope, history and reviews based on observed workflows.
5. Dashboard widget composition and report definitions; workspace organization for all asset types.
6. Scheduling/work calendars and durable automations, backed by controlled fixtures.

## Still unresolved

This is a first inspection pass, not complete reverse engineering. Exact formula coercion/reference behavior, report grouping/summary behavior, proof review/annotation lifecycle, form logic, automation retries, dependencies, permissions, imports/exports, simultaneous edits, and production-scale behavior still require controlled observation and tests. Broad parity must not be marked complete from this report.
