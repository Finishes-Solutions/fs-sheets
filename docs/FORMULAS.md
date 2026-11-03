# Formula engine and inferred calculations

Open a sheet and choose **ƒx Formulas** to edit a cell or column formula and preview its result. **Formula audit** shows active column formulas, evidence for inferred definitions, retained exceptions, and review-only suggestions. The function picker lists the 131 registered function names.

## Supported conventions

- Smartsheet-style named columns: `[Amount]@row`, `[Amount]1`, `$[Amount]$1`, `[Amount]1:[Amount]10`, whole-column `[Amount]`, and `{Other sheet::Amount}`.
- Excel-style data-cell addresses: `A1`, `$A$1`, `A$1`, `$A1`, `A1:C10`, `A:A`, and `'Other sheet'!A1:B10`. Row 1 is the first **data** row, excluding the application header; these are not the original Excel worksheet row numbers. Quoted sheet names escape apostrophes by doubling them.
- Arithmetic, comparisons, concatenation, scientific notation, percentages, parentheses, comma or semicolon function arguments, constants, and rectangular array constants.
- Relative fill-down adjusts unanchored row references while preserving `$` anchors and quoted text. Column formulas with A1 references behave like a fill starting at the formula editor's chosen row. Named `@row` formulas always use their own row. Explicit numbered named references in column formulas remain fixed; fill-down of cell formulas adjusts their unanchored row numbers.
- Cached calculated values and parsed expressions, cross-sheet dependency evaluation, circular-reference detection, and calculation/range/depth limits. Each render/save calculation gets a fresh cache, so source edits recalculate dependents. There is no `eval` or generated JavaScript.

Examples:

```text
=SUMIFS([Amount], [Status], "Approved", [Amount], ">0")
=SUM(COLLECT([Amount], [Status], "Approved", [Amount], @cell > 100))
=XLOOKUP(A1, 'Other sheet'!A1:A100, 'Other sheet'!B1:B100, "Not found")
=IFERROR(INDEX(A1:C10, MATCH("Vendor", B1:B10, 0), 3), 0)
=WORKDAY.INTL([Start]@row, 5, 11)
=SUMPRODUCT((A1:A10 > 100) * A1:A10)
```

Function families include numeric/statistical aggregates, SUMIFS/COUNTIFS/AVERAGEIFS/MINIFS/MAXIFS, COLLECT and `@cell` criteria, conditional logic with lazy IF/IFERROR/IFS/SWITCH/CHOOSE branches, lookup/index/match functions, text operations, business dates with optional holidays and weekend masks, hierarchy functions, basic PMT/PV/FV calculations, and in-cell arrays with FILTER/SORT/UNIQUE/SEQUENCE/TRANSPOSE. Criteria comparisons ignore case and support `*`, `?`, and `~` wildcard escaping. SUMIFS uses Excel's sum-range-first order. COUNT uses numeric-only Excel behavior in A1 expressions, and nonempty Smartsheet behavior in named-column expressions; COUNTA always counts nonempty entries.

Dates remain ISO strings in the app. Date functions also accept serial dates; date subtraction returns days and date-plus-number returns an ISO date. Numeric display formats support common zero padding, decimals, grouping, currency/percent affixes, and positive/negative/zero sections; date display formats support common year/month/day tokens. Unsupported TEXT formats return an explicit error.

## Inferred formulas installed in the supplied sheets

These are new rules inferred from values, **not recovered originals**. Existing raw cell values remain stored beneath the column formula. A backup was saved before applying them.

| Sheet | Field | Agreement against populated export values |
| --- | --- | ---: |
| PO/PRF | Month | 1,688 / 1,688 |
| PO/PRF | Year | 1,688 / 1,688 |
| PO/PRF | 1 day late | 1,685 / 1,688 |
| PO/PRF | 2 days | 1,685 / 1,688 |
| PO/PRF | 4 days | 1,685 / 1,688 |
| PO/PRF | Archive | 1,685 / 1,688 |
| Acres schedule | Duration | 244 / 244 |
| Acres project | Duration | 830 / 833 |
| Acres project | Variance | 389 / 389 |

Month/year come from submission dates. Reminders use Monday–Friday workdays. Durations use an inclusive Monday–Saturday calendar, with a minimum of one day. Variance measures baseline finish minus finish in Monday–Saturday working-day boundaries. Archive uses `TODAY()` minus the submission date, so its age advances with time; the comparison date for the export was November 2, 2026 (UTC date convention, matching the existing app).

Fifteen exceptional cells remain literal exported values rather than being overwritten by the inferred rule. The Formula audit lists these rows. **Use formula** releases one exception; **Restore retained values** removes a column formula and shows its retained values. Both actions save through normal revision checks and undo history. New rows use the column formula. Source rows must be unlocked to install column formulas or change exception overrides.

A candidate `Balance Left = Schedule Totals - Pay App` matched only 57 of 60 populated financial values. It was **not applied**; the Formula audit shows its differences. Purchase-order balance, duplicate-detection criteria, approval flags, empty completion fields, and allocation logic were not guessed because exported values do not establish an unambiguous rule. No holiday calendar was exported, and the date exceptions may reflect custom calendars or manual overrides.

The repeatable local migration is `node scripts/infer-formulas.mjs` for analysis, or `node scripts/infer-formulas.mjs --apply` to back up and apply eligible rules through the local API. It requires at least 20 examples and 99% agreement, preserves exceptions and blank-value differences, skips existing formulas and locked sheets, and never auto-applies financial candidates. The detailed local report is in ignored `data/imports/formula-inference-report.json`. The input archive and backups remain the audit source.

## Compatibility boundaries

This is an expanded local spreadsheet engine, not certified or complete Excel/Smartsheet parity. The advertised function names cover common argument forms, not every option or coercion rule of either product. Excel's full function catalog, VBA/macros, Power Query, external workbook links, structured Excel table references, arbitrary named ranges, iterative circular calculation, automatic dependency rewrites on row insertion/column rename, dynamic arrays spilling into adjacent cells, and Excel's fictitious February 29, 1900 are not implemented. Array results remain inside their formula cell and can feed other functions. Unsupported functions return `#UNSUPPORTED!`; invalid references and circular calculations return explicit errors.

Editing a formula or filling cells can replace existing formula definitions/values; preview first. Fill-down requires unlocked targets. Changing a source column name or inserting/moving rows can require updating explicit references. The existing 64 MB project-save limit still applies.
