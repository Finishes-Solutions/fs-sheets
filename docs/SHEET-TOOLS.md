# Sheet tools — v0.4

This release implements the requested toolbar and richer local workflows using observations from the running Smartsheet app, official product documentation, and independent design choices. It does not establish full Smartsheet or monday.com parity.

## Row controls

The row gutter is **paperclip → comments → proofing → lock**, before the first data column. Click the lock to toggle it. Locked rows cannot have cells/hierarchy edited or be removed; the API enforces this for all editing paths, including paste and board moves. Comments, attachments and reviews remain available. Unlock in a separate save before changing cells, deleting a column, or changing an existing column type/formula. Locks are accidental-edit protection, not permissions: any local tester can unlock.

## Columns

Open **Columns → Add column**, or a column header to edit its definition. The manager searches, shows/hides and reorders columns; the primary column stays first and visible. Rich values use dedicated cell dialogs and also work through details and forms.

| Types | Local behavior |
| --- | --- |
| Text / number, long text | Single-line or multiline text; formulas can be entered beginning with `=` |
| Number, currency, percent, rating, duration | Numeric values; percent uses fractions (0.25 = 25%); rating is 0–5; duration is a number of days, without dependency scheduling |
| Date, checkbox | Valid calendar date / boolean |
| Dropdown/status, multi-select, symbols, tags | Configured choices or multiple labels; symbols can use emoji choices; tags are multiple text labels |
| Contact, people/multiple contacts | Single text contact or multiple names; People provides choices from the local directory |
| Item ID, auto-number | Full stable row ID, or persistent sequential number with prefix/padding; deleted numbers are not reused during ordinary editing |
| Timeline | Valid start/end pair; end cannot precede start. A timeline-only sheet can render its range in Gantt/Timeline |
| Connected sheet | One or more references to rows in this local project, current source titles and navigation; deleted targets display a missing-row marker |
| Link | HTTP(S) URL plus optional label; open from its editor |
| Location | Address/place plus optional validated latitude/longitude |
| Email, phone | Text with appropriate editor controls |
| Created date/by, modified date/by | Automatic row metadata; names are tester labels |
| Formula | A calculated column using the current formula engine |
| Files, latest comment | Read-only projections of the row’s attachments or newest comment |

Connections are one-way references, not two-way synchronization or mirrored fields. Location has no map/geocoding service. People are not authenticated users or invitations. Type conversion validates all existing values; a failed conversion leaves data unchanged. Hiding fields is not security.

## Filtering, sorting and formatting

**Filter** supports named conditions, all/any matching, numeric/date/text comparisons, relative dates and row properties (lock, attachment count, comment count). Include parents for context. Filter definitions are shared; each browser remembers its own active filter.

**Sort** saves up to three keys. Siblings sort together and children remain beneath parents. Blanks stay last; dropdowns follow configured choice order. Sorting changes the view without renumbering the stored row order or formula row references.

Select a cell or check rows, then use **B / I / U / Format**. Format supports fill/text colors, size, alignment, underline/strike and wrapping. Copy style and Paste style transfer appearance. Conditional formatting supports multiple conditions, row or selected-column scope, ordered priority, pause, duplicate and delete. Higher rules win for each style property. Clear formatting removes manual formatting from the selected cells/rows; conditional rules still apply. Rule formatting also appears on board cards, calendar items and timeline bars using the primary-column style.

## Formulas and summary

**Formulas** selects a cell or column target, inserts references and previews the result. A blank removes the formula. Calculated columns cannot be edited as ordinary cells. Update requests also keep cell formulas read-only. **Summary** stores named values or formulas such as `=SUM([Budget])` and `=COUNTIF([Status], "Complete")`.

The engine has 34 functions and independent syntax. It does not implement the entire Smartsheet catalog. References use names and are not rewritten automatically when sheets/columns are renamed. Existing formulas and errors remain explicit.

## People, mentions, requests and inbox

**People** adds local tester names and optional email labels. Click a mention suggestion in a comment to insert `@[Name]`; posting creates an inbox item for that directory person. Plain unresolved `@text` is not a notification. Use **Test as this person** to inspect that name’s inbox.

Select rows or focus a cell, then **Requests → Create request**. Choose update or approval, recipients, instructions and included fields. Update responses change only included editable fields; locked rows and formulas remain protected. Approval requests require all assigned names to approve; any decline closes the request as declined. Requests preserve responses and can be cancelled while open. An update request closes after its first submission.

These are local workflows. Nothing is emailed, texted or pushed to a third-party service. Tester names can be switched freely and do not verify identity.

## Automation

Each sheet has an **Automations** manager. A workflow has a trigger, optional all/any conditions and ordered actions.

- Triggers: a cell changes to a specified value; a new row is added; a date is reached.
- Actions: change a cell; lock the row; create an update/approval request; notify local inboxes.
- Date workflows are checked on saves and every minute while the server runs. They use UTC dates and run once per workflow/row/date value; changing the date creates a new eligible occurrence. They catch due dates after a restart. A date rule is not a recurring calendar schedule.
- Workflow actions do not recursively re-run the same workflow. A locked row skips cell writes but can still generate a local request/notification. Conditions and later workflows can see values changed by earlier actions.
- The manager supports editing, pausing, deleting, last-run time and run counts. Activity records successful runs.

## Verified and remaining

34 automated tests cover the existing application plus typed cells, locks at the API boundary, stable numbers, row properties/relative filters, hierarchy sorting, format priorities, resolved mentions, ordered actions, date deduplication and persistence across restart. Browser tests exercised locks, timeline editing, people/mentions/inbox, conditional rules, saved filters, formula preview/save, update requests, and an automation that locks completed work. The toolbar was checked at laptop width.

Not implemented: authenticated sharing/roles, column locks, complete formula compatibility, structural formula rewrites, dependency/critical-path scheduling, two-way connections/mirrors, map services, external request delivery, recurring/branching workflow scheduling, or every specialized monday column. The full project is still saved per edit, and the grid is not virtualized. See [Parity ledger](PARITY.md).

## Sources

- [Live native observations](LIVE-OBSERVATIONS.md) — sanitized observation record, with evidence limits.
- [Smartsheet locking](https://help.smartsheet.com/articles/522077-locking-unlocking-columns-and-rows), [column types](https://help.smartsheet.com/articles/2480241-column-type-reference), [sorting](https://help.smartsheet.com/articles/504742-sort-rows-organize-your-data), [conditional formatting](https://help.smartsheet.com/learning-track/view-and-organize-sheet-data/apply-conditional-formatting), [mentions](https://help.smartsheet.com/articles/2480306-tag-someone-with-the-at-sign).
- [monday column catalog](https://support.monday.com/hc/en-us/articles/115005310285-Available-column-types-on-monday-com), [Timeline](https://support.monday.com/hc/en-us/articles/115005333969-The-Timeline-Column), [Connect Boards](https://support.monday.com/hc/en-us/articles/360000635139-The-Connect-Boards-Column).
