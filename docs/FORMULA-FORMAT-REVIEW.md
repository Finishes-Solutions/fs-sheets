# Formula and conditional-formatting review — November 2, 2026

## Read-only Smartsheet inspection

Inspected the user's existing budget in classic Grid view and Active All Projects in modern Table view. Opened the existing conditional-format manager, the contextual formula drawer, and expanded an existing rule. Closed without applying changes and returned to Home. No cell edits, new rules, rule toggles, or saves were performed in Smartsheet.

Observed patterns used: contextual right-side formula panel; explicit Apply action; rules described as When / Format cells in; visible priority, enable/disable, duplicate and delete controls. Application chrome remains monochrome.

## Delivered

- Formula drawer with cell/column scope, row number, raw syntax, result preview, column-reference insertion, function/column suggestions, Tab completion and function guidance.
- Budget starters for child subtotals and quantity × unit cost. Remaining budget and budget-used percentage starters appear when Budget and Spent/Actual columns exist.
- Error explanations and inline formula assistance while editing cells. Stable imported CELLREF references are explained using column names and row numbers, without rewriting original formulas.
- Conditional-format drawer with readable rule summaries, up/down priority controls, enable/pause, duplicate and delete.
- Rule editor with AND/OR conditions, value or another-column comparison for the first condition, entire-row or selected-column scope, in-app color palette and text styling, and a calculated match count with a sample matching row.
- Budget-alert starter. Draft previews do not write data; Apply formula / Save rule are explicit commits.

## Verification

216 automated tests passed. Added tests for formula completion, quoted text, error guidance, column comparisons, rule priority, target-column scope and disabled rules.

Mutation tests used a SQLite copy of the complete budget database on port 4318:

- Quantity × unit cost preview returned $13,759,200, matching the existing reconstructed formula.
- Divide-by-zero draft displayed a readable explanation.
- Function completion and applying a named-reference formula worked.
- A Total Cost > 10,000,000 rule found 206 rows. A matching amount received the specified fill/bold; a smaller amount remained unchanged. Pausing removed the effect.
- Inline function suggestions worked; Escape cancelled the unfinished formula without altering the saved expression.
- Screenshots show the tested copy. The example formula and high-value rule were not applied to the live budget.

Live verification: the original formula still previews $13,759,200 and names both input columns. The entire live workspace state matched the pre-work backup (revision 32 before and after), including all 11,444 budget rows. Hash evidence: formula-data-preservation.json.

This reproduces the inspected interaction patterns, not every Smartsheet feature. There is no AI formula generation. The side drawers require closing before interacting with the grid; they do not yet support clicking grid cells to insert references. Existing engine compatibility limits remain.
