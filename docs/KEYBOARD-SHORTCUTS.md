# Sheet keyboard and UX update — November 2, 2026

## Implemented

Column titles select the full column across the current filtered view and all pages. Ellipsis buttons independently open anchored menus. Row numbers select rows; right-click opens row actions. The footer displays selection dimensions.

Supported commands include copy/cut/paste, save, undo/redo, F2, fill down, clear contents, edit row, hyperlinks, find, workspace search/open, go to row, Home/End, sheet bounds, Page Up/Down, range extension, row/column selection, insertion, indent/outdent, bold/italic/underline, line breaks, formula reference locks, hierarchy collapse/expand, and focus mode. See More tools → Keyboard shortcuts for bindings.

Date entry supports t, tom, ^yes, signed day offsets, weekdays, last/next week and month/day abbreviations. Dates use the local calendar.

Copy/paste of selected columns duplicates editable column properties without data. Selected rows pasted onto row selection insert rows without comments, attachments or proofs. Internal cell formula copy/paste translates relative references. Double-click/F2 editing preserves multiline cell paste. Board cards support arrow navigation, Space expansion, Enter editing and Shift+Enter subtasks. Dashboard panels are keyboard-focusable.

## Verification performed

- Full automated suite: 213 passed, zero failures.
- Live budget: column title selects 11,444 rows, with 50 rendered on the page.
- Isolated database: column fill down, bold formatting, undo/redo, column property duplication, date shortcut entry, insertion/undo, hyperlink dialog, anchored column menus, row context menus and focus mode.
- Clipboard: two-by-two typed paste; quoted multiline two-row copy/paste round-trip; F2 multiline single-cell paste.
- Zoom: 80%, 100%, 150%; multiline row height measured 47px at 100% and 70.5px at 150%.
- Fixed focus loss after range edits, stale range on focus movement, and retained sticky headers.
- User sheet values were not changed during these tests. Mutation tests ran against a separate database on port 4318.

## Scope and remaining differences

This is broad regression coverage, not an exhaustive certification of every browser, input device, or application page. Operating-system-reserved keys may never reach the app (notably Command+Space). The supplied reference does not specify keys for clear formatting, insert comment or duplicate sheet; these remain menu actions rather than guessed bindings.

Undo and redo now persist up to 50 steps in SQLite, with atomic transitions, revision checks and session ownership. See HISTORY-WORKFLOW.md for budget-copy verification. Cross-sheet row structure paste is rejected; ordinary cell paste is available. The advanced-search shortcut opens the existing workspace search, and Manage References opens the formula/reference editor. Hierarchy controls collapse/expand all for a column or one descendant level per press for selected rows. Native OS bullet-character entry remains available. Local accounts, access controls and concurrent-edit merging remain outside this update.
