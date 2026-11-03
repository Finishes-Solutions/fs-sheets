# v0.9 features — November 2, 2026

Built and verified on a SQLite copy of the full workspace (including the 11,444-row budget) on a separate port. The live database was only read for before/after comparison.

## 1. Row side panel
A right-hand panel shows **Comments, Files, Proofs and History** for the selected row. It sits beside the grid, which narrows to make room, and follows the row you click.
- Opens from the toolbar **Comments** button or any row icon; ↑/↓ step rows, Esc closes, arrow keys switch tabs.
- Unsent comment drafts are kept per row, so a draft never moves to another row. ⌘Enter posts.
- Files: drag and drop or choose, up to 2 MB each.
- **History** lists recorded cell changes (who, when, from → to) for the whole row or only the selected column. The server records the last 30 changes per row and ignores any history a browser sends. Edits made before v0.9 have no recorded history.

## 2. Formulas that survive renames
- Renaming a column rewrites `[Column]` references in its sheet and `{Sheet::Column}` references in other sheets.
- Renaming a sheet rewrites `{Sheet::…}` and `'Sheet'!A1` references.
- Quoted text is never changed.
- Report, dashboard and portfolio fields follow the rename only when no other source sheet has a column with the old name.
- If the rename would need to change formulas in locked rows, it is refused with a list of those rows; nothing is changed.
- Sheet names must now be unique, because cross-sheet references use names.

## 3. Excel-style editing
- **Selection totals:** the footer shows Sum, Average and Count for any multi-cell selection, in the column's format.
- **Fill handle:** drag the square at the selection corner down or right.
  - A single number copies; two or more numbers continue the series.
  - Dates step by day or by the gap between the selected dates.
  - "Phase 9" continues to "Phase 10".
  - Formulas shift their relative references.
  - Locked rows and calculated columns are refused.
- **Freeze columns:** column menu → *Freeze columns through here* (up to six). This is saved with the sheet.
- **Drag to reorder:** drag a row number (children move with it and it becomes a sibling of the drop target) or a column title. The primary column stays first.
- **Find and replace** (⇧⌘H / Shift+Ctrl+H, or the search popover):
  - Live match count, plus match case, entire cell, and selected-columns-only options.
  - *Find next* moves the selection to the next match.
  - Formulas, locked rows and calculated columns are skipped and counted; Replace all is one undo step.

## 4. Excel (.xlsx) export with live formulas
Export → current sheet, folder, or whole workspace.
- Formulas are translated to A1 references: `[Col]@row`, ranges, whole columns, absolute `$` references, `CELLREF`, `CHILDREN()`, cross-sheet references within the workbook, and A1 references.
- Newer functions get Excel's required `_xlfn.` prefix.
- A formula with no faithful Excel equivalent (Smartsheet-only functions, `@cell` criteria, references to sheets outside the export) is written as its **value**, with the original formula in a cell note. Nothing is guessed.
- Also exported: number formats, bold/italic/underline/strikethrough, fills, text colors and alignment, outline levels for the hierarchy (summary rows above details), frozen panes, hidden columns, hyperlinks, and row comments as notes.
- **Verification:** the 11,444-row budget exports in about 1.8 s with all 18,835 formulas live. Recalculating each exported formula reproduces the original value in 18,835 of 18,835 cells. The file has not been opened in Excel during testing.

## 6. Import from Smartsheet (API)
Create → **Import from Smartsheet**: choose a region (US/EU/AU), paste an API token, load your sheets, then tick the ones to import.
- The token is used for that request only: it is never stored, logged or returned. A test checks the database file does not contain it.
- Imported: hierarchy, column types (system columns become text that keeps their values), column and cell formulas, comments, hyperlinks, locks, and bold/italic/alignment/colors from Smartsheet's palette.
- Named cross-sheet ranges become `{Sheet::Column}` when they cover a whole column.
- **Every imported formula is recalculated and compared with the value Smartsheet displayed.** The report lists every difference; values are never changed to match.
- Already-imported sheets are skipped. Smartsheet attachments are counted but not copied.
- Tested against a simulated Smartsheet API, not a live account.

## 7. Project templates and budget rollups
- **Templates:** Folder settings → *Use as project template*. Create → **Project from template** builds a new project folder that copies every sheet in the template.
  - Copied sheets get fresh IDs and are named "Project – Sheet".
  - `CELLREF` IDs and references between template sheets point at the new copies; references to other sheets are kept.
  - Reports and dashboards that use only template sheets are copied too.
  - Choose *copy everything*, *keep rows and formulas but clear entered values*, or *structure only*.
  - Comments, files, history and import audit data are not copied.
- **Budget vs actual:** each portfolio sheet can map Budget and Actual to a **sheet-summary field** (recommended when rows include subtotals) or the sum of leaf rows. The portfolio shows a monochrome bar chart and a table with variance, % used and the source of each number.

## Also fixed
- The sidebar's bottom menu overlapped long workspace lists; the tree now scrolls.

## Tests
`npm test`: 272 passing. New suites: `change-log`, `formula-rename`, `grid-tools`, `excel-export` (including a Python write/read round trip), `smartsheet-import` (converter plus a mock-API end-to-end test), and `templates` (copy independence, modes, rollups, chart).
