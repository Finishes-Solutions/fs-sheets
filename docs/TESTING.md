# Testing sheets on this Mac

Open http://localhost:4317 while `npm run dev` runs in the project folder. No installation of dependencies or cloud account is required. The server listens only on this Mac. Sample data is illustrative.

1. Click the tester avatar at the bottom left and enter your name. Names are labels, not accounts.
2. Create a scratch sheet or duplicate the sample before trying destructive workflows. Add typed columns, rows, and a formula such as `=[Budget]@row - [Spent]@row`.
3. Edit values, reload, and confirm they persist. Use View options to hide columns and map board/calendar/timeline fields. Column headers expose width, order, type, and formula settings.
4. In Reports, create a report with source sheets, a status condition, Owner grouping, and chosen columns. Compare its rows with the sources, then export CSV. Exclude parent rows when totals must avoid counting both parent and child budgets.
5. In Dashboards, create a dashboard, map your status/date/owner/numeric fields, and choose panels. Compare the total with sheet values. Due-date bars show upcoming scheduled items, not historical performance. Completion recognizes Complete, Completed, Done, and Closed.
6. Create a form, choose fields, mark required fields, and submit a scratch request. Confirm the row appears in the sheet, report, and dashboard.
7. Try a cell-change automation on scratch rows. It runs when an actual value changes to the configured value.
8. Open a second browser tab. Changes appear after polling (about four seconds in an active tab). An open editor is retained. A conflicting save offers **Save unsaved draft** and **Load latest**. Save the draft first if needed, then load latest and reapply the intended changes. The downloaded JSON is a recovery copy; restoring it replaces the whole project and should not be used to merge concurrent edits.
9. Use Export → Entire project for a portable backup. Restore replaces project contents. Undo can restore prior saved states, but cannot undo another tab’s latest change.
10. Record issues in Test lab with steps and expected results. Mark checklist items as you verify them. Feedback and checks are shared in the local database.

## Limits for this testing round

No login, permissions, remote access, real-time cell merging, dependency scheduling, or complete Smartsheet formula compatibility. Forms are local. Keep one server/database instance running; Dropbox sync does not coordinate database writers. The grid is not virtualized. Use small sample projects and small attachments (2 MB/file, 64 MB/project save).

The database is `data/fs-sheet.sqlite`. Never copy an active SQLite database without a backup-aware tool; its journal may contain recent changes. Prefer the in-app JSON export, or stop the server before copying all database files.

Run `npm test` for the automated checks (212 passed in the November 2, 2026 run). Browser checks are documented in README. Drag/drop, attachment downloads, CSV round-trips, and broader accessibility/keyboard regression remain test work.

## Left-side row tools and proofing

The paperclip, speech bubble, review, and lock icons sit immediately before the first data column on every table row. They stay visible when scrolling sideways. Badges show attachment, comment, or proof counts.

- Paperclip: choose a file and click Add attachment; download or remove saved files. Files are limited to 2 MB. Removing a row attachment does not remove a proof version created from it, because the proof stores its own snapshot.
- Comments: post a note under your tester label. Comments persist with the row.
- Proofing: create a proof with a file upload or existing attachment, and optionally list reviewers separated by commas. Open the proof to comment, approve, or request changes. Change requests require notes. Use an assigned reviewer name for approval decisions. Names are local labels, not authenticated identities.
- New version: add another file; the new version starts In review. Use the version selector to inspect older files and decisions. With assigned reviewers, every assigned reviewer must approve. A change request takes precedence until that reviewer records a newer approval.
- These are local reviews: no email invitations, notifications, drawing annotations, PDF/video markup, or identity verification are implemented. Raster images preview; other files download.

Manual upload check: use the regular file chooser to attach a small file, reload, then download it and compare contents. Browser automation could not complete new-file uploads because its Chrome extension lacked local-file access. Proof reviews and version transitions were tested with synthetic API fixtures and the existing-attachment path.

## Version 0.4 sheet tools

Follow [Sheet tools](SHEET-TOOLS.md) to test locks, typed cells, conditional rules, filters, formulas, requests, mentions and workflows. Use a scratch sheet. Automated checks cover engine/API behavior; new-file upload still needs the manual check above.


## November 2 budget and grid verification

The full suite passed 212 tests. After the final inference adjustment, the focused budget/date tests passed again. Browser checks used an isolated SQLite database on port 4318, leaving production rows unchanged.

- In-page date calendar: select, clear, month/year navigation and persisted date edits.
- Anchored column ellipsis menu and side-panel properties; fit-to-content changes persisted.
- At 80%, 100% and 150%: rectangular selection, six-cell Excel TSV copy/paste with quoted multiline text, editing, and wrapping.
- Rapid consecutive Owner/date edits both persisted after reload; saves are queued.
- Budget quantity change recalculated detail and parent totals; Undo restored the original amount.
- Production import independently reconciled 148,772 cells against the original Excel extraction. All five pre-existing sheets were unchanged.

See BUDGET-IMPORT.md for inference assumptions and source issues. These checks do not establish enterprise security or multi-user readiness.
