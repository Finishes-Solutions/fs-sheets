# Capability ledger and implementation sequence

Updated 2026-11-02. The goal is an independent tool covering the user's sheet, view, formula, workspace, and surrounding workflow needs. Version 0.3 is a functional local testing foundation. It does not establish full feature parity or compatibility with Smartsheet.

## Status

| Area | Working in 0.3 | Remaining work |
| --- | --- | --- |
| Organization | Workspaces, one-level folders, sheet creation/rename/move/duplicate | Nested folders, collections, favorites, trash, workspace templates, cross-workspace moves |
| Grid | Editable cells, typed columns, multi-cell paste, row selection, indentation, collapse, search/filter/sort, saved column widths/order/visibility | Virtualization, range selection, fill handle, drag resizing, frozen columns, formatting rules, locked rows/columns, row moves/copies between sheets |
| Column model | Text, numbers, single-select, dates, checkbox, free-text contacts | Multi-select, symbol sets, contact identity, auto-number, system columns, duration, latest-comment column, robust conversion/validation |
| Formulas | Arithmetic/comparison, cell/column formulas, same-column ranges, selected text/date/logical/aggregate/lookup functions, hierarchy, named cross-sheet lookup | Complete function catalog, exact coercion/blank/error semantics, reference rewriting on structural changes, named cross-sheet range management, dependency graph and incremental recalculation, compatibility fixtures |
| Table/grid | One table implementation | Distinct behavior parity for legacy grid and modern table features |
| Board/card | One board implementation, configurable text/contact/dropdown lanes, drag to change field | Lane order, card field settings, grouping, collapsed lanes, separate legacy card compatibility |
| Calendar | Month grid with date mapping | Week view, multi-day events, drag/resize, calendar feeds |
| Gantt/timeline | Date-range bars with configurable start/end fields | Predecessors, dependency types/lag, workdays/holidays, duration scheduling, baselines, milestones, critical path, rollups, interactive drag/resize, timeline grouping |
| Reports | Source sheets, AND/OR filters, selected columns, grouping, sorting, leaf-row scope, CSV, editable source detail | Arbitrary grouped aggregates, sheet-summary reports, permission-aware results |
| Dashboards | Saved dashboards with mapped fields and panel selection; metrics, status donut, workload, upcoming dates, source drilldown | Freeform widget layouts, charts from reports, rich text, embedding, published dashboards |
| Forms | Local forms with field selection, typed input, required-field rules, submission into sheets | Field order, conditional logic, branding, hidden values, public endpoints, attachments, spam controls |
| Automations | Cell-value transition sets another cell; toggles and activity | Time triggers, branching, approval/update requests, notifications, copy/move/lock actions, transactional event queue, retries/idempotency, execution history |
| Collaboration | Local notes, attachments, tester labels, feedback/checklist, activity, change polling and stale-draft download; left-side row tools; file proof versions, comments, approvals/change requests | Users, sharing roles, inherited permissions, mentions, presence, concurrent editing, notifications, cell history, proof annotations, PDF/video inline review, verified reviewer identities, notifications |
| Data interchange | CSV values, whole-project JSON restore, printing | XLSX/MS Project import/export, Smartsheet account migration, type/formula mapping, stable external IDs, conflict reports |
| Platform | Loopback server, SQLite, local backups, stale-save rejection | Normalized storage, migrations, per-entity commands, tenant/user model, object storage, scalable search, observability, deployment and restore procedures |
| Extended suite | Not implemented | Resource management, portfolio provisioning, Control Center-like templates/updates, Dynamic View-style restricted views, data connectors, Data Shuttle-style ingestion, document generation, WorkApps-style portals, APIs/webhooks, AI assistance |

## Build order

1. **Strengthen the sheet engine.** Normalize entities, introduce command-level mutations, virtualize the grid, implement range operations and structural reference rewriting. Gate: 10,000-row interaction benchmark and an automated edit/undo/import regression suite.
2. **Establish formula compatibility.** Enumerate the official function catalog; track every function as unimplemented/implemented/tested. Build expected-result fixtures for blanks, types, ranges, hierarchy, cross-sheet changes, error propagation, and structural edits. Gate: an explicit compatibility report, not just a list of function names.
3. **Finish planning and views.** Shared view definitions, configurable date/field mappings, dependencies with cycle detection and work calendars, baselines and critical path. Gate: identical data updates across table, board, calendar, and schedule views, with deterministic scheduling fixtures.
4. **Reports, dashboards, forms, automation.** Typed query model, editable projection rules, dashboard widget definitions, form schema, and a durable workflow/event engine. Gate: form → row → recalculation → report → dashboard → automation works end to end with retries and no duplicate actions.
5. **Collaboration and production operation.** Users/roles/inheritance, real-time changes, versioned commands, attachments in object storage, audit events, backups and tenant boundaries. Gate: concurrent edits, unauthorized reads/writes, restore drills, and attachment access tests.
6. **Migration and extended features.** Import representative exports or authorized account data, compare totals/formulas/structure, add connectors and portfolio tools according to actual usage. Gate: migration dry-run manifest plus reconciled counts and documented unsupported behaviors.

## Discovery still needed

The desktop package alone cannot establish server-side behavior. Build a representative, user-authorized test workspace with nested tasks, typed fields, formulas, cross-sheet references, report/dashboard, form, and automation. Observe and record one behavior at a time using synthetic records. Do not alter existing business sheets merely to gather evidence. Read-only account inspection can identify which templates and workflows matter most; changes or outbound notifications need their own concrete scope.

The existing application was inspected statically only. No live Smartsheet sheets, contacts, credentials, or workspace records were accessed during this build.

## Official reference map

- [Core item model](https://help.smartsheet.com/articles/504531-create-sheets-and-other-items): sheets, reports, dashboards, and forms.
- [Workspace organization](https://help.smartsheet.com/articles/2482797-workspace-navigation): workspace contents and navigation.
- [Column types](https://help.smartsheet.com/articles/2480241-column-type-reference): primary/configurable columns and typed fields.
- [View behavior](https://help.smartsheet.com/articles/765715-grid-gantt-calendar-and-card-views): table, timeline, board, grid, Gantt, card, and calendar over shared data.
- [Formula catalog](https://help.smartsheet.com/functions) and [formula basics](https://help.smartsheet.com/learning-track/level-3-solutions/formula-basics): function inventory and references. The full catalog page was not retrievable in this session; exhaustiveness remains unverified.
- [Hierarchy functions](https://help.smartsheet.com/articles/2476811-reference-children-parents-ancestors-hierarchy-functions): CHILDREN, PARENT, ANCESTORS; cross-sheet hierarchy constraints.
- [Reports](https://help.smartsheet.com/learning-track/level-1-foundations/reports): multi-sheet projections and editing constraints.
- [Platform features](https://www.smartsheet.com/platform/features): automation, forms, dashboards, integrations, collaboration, and extensions.

This is a proposed engineering backlog, not a statement that all listed Smartsheet behavior was observed or that every plan/region exposes the same capabilities.
