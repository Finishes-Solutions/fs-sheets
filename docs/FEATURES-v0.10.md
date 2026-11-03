# v0.10 — hierarchy, menus, storage, printing

## Child rows (indent / outdent)
- Right-click a row → **Make child of row above** (⌘]) or **Move out one level** (⌘[). Also in the Format menu and More tools → Edit. Works on checked rows or on the rows of a cell selection.
- Indent makes each row the last child of the **previous row at the same level**. Before, it used the row directly above, so a row could jump several levels at once. Indenting several sibling rows keeps them siblings, and children move with their parent.
- Outdent moves a row up one level. Rows below it that shared its old parent become its children, so the on-screen order never changes (same as Smartsheet).
- Rows that can't move (the first row at a level, or rows already at the top) are skipped with a message. Locked rows are never changed. Each action is one undo step.

## Menus
- Row, column, Format and More tools menus have icons, grouped sections, shortcut hints, and a separated Delete. All monochrome.
- Format menu: Bold / Italic / Underline / Strikethrough and left / center / right as button groups that show the active cell's current state. Also: Font, color & fill (with a fill swatch), Make child, Move out, Wrap, Copy / Paste style, and Conditional formatting rules.
- "Comments, files & history" in the row menu opens the side panel.

## Storage: one row per sheet (#1)
- The workspace is now stored as one SQLite row per sheet plus a small row for everything else. A save rewrites only the sheets that changed. Editing a small sheet writes about 0.2 MB instead of the whole 33.7 MB workspace, so Dropbox has much less to sync.
- On first start, the server takes a consistent SQLite backup in `backups/before-sheet-store-*`. It then converts the data in one transaction and commits only if the reassembled workspace is byte-for-byte identical to the original.
- Verified on a copy of the full workspace: identical text, identical per-sheet fingerprints, and 18,835 of 18,835 budget formulas matching their audited source values.
- Older versions of the app cannot read the new format. Before checking out an older version, restore the `before-sheet-store` backup.
- Save time is about the same (~0.6 s). The remaining time goes to checking the whole workspace, not to writing it.

## Smartsheet attachments (#2)
- Files up to 2 MB are downloaded during import and stored on their row. The API token is never sent to the file host.
- Links (Google Drive, Box, web links) and larger files are listed in the import report by row, with the reason. They are never dropped silently.
- Tested against a simulated Smartsheet API.

## Excel export check (#3)
- The exported 11,444-row budget was recalculated by an independent Excel engine (the Python `formulas` package). All 18,835 formulas parse and match the app's values exactly.
- This check found a bug: a formula with a syntax error was exported as a broken Excel formula. It is now written as its value, with the original formula in a cell note.
- Microsoft Excel itself could not be automated during testing because it was waiting on a dialog. Opening one export in Excel is still worth doing.

## Printing (#4)
- Printing now includes every row. Normally only about 120 rows are on the page at once. The budget prints as 309 landscape pages, and the screen returns to normal afterwards.

## Scrolling with wrapped text (#5)
- The grid remembers each row's real height once it has been on screen, and uses a fixed estimate for rows not yet seen. Wrapped rows no longer leave blank gaps or jump while scrolling.
- Tested at 7 scroll positions with wrap on and off, using small wheel scrolls; the last row (11,444) is reachable.

## Tests
`npm test`: 284 passing. New tests cover indent/outdent, the row-height index, storage (migration with backup, partial writes, ordering, damage detection), attachments through the mock API, and syntax-error export.
