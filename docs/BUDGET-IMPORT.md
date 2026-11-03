# Project budget workbook

The imported Project budgets 2024–2025 sheet contains 11,444 rows and three comments from Copy of Budget For Projects 2024-2025.xlsx. The original file is unchanged. Blank source rows and original values remain available; columns with no useful visible content are hidden rather than discarded.

The export contains no original formulas. The reconstruction installs 18,835 formulas only where their initial results reconcile to source values. It assumes quantity and rate are inputs when their product matches cost. Other inferred relationships include monthly/annual amounts, child and section rollups, uniquely matched percentage denominators, blended rates and budget less spent. Matching arithmetic cannot prove the original financial intent.

Import review shows 70 pre-existing source errors, 2,405 percentages without a unique supported denominator and 192 quantity/rate discrepancies. They remain unchanged, not replaced by zero. Review can filter issues, navigate to the source row and download CSV. This is an import-time audit, not a continuously refreshed validation report.

CELLREF(rowId, columnId) preserves references across row insertion and column reordering/renaming. CELLREF("@row", columnId) addresses the current row. Child sums use SUM(CHILDREN()). Imported cells retain budgetSource and budgetFormulas metadata for provenance. Manually overwriting a formula changes the live calculation, not the source audit record.

All 148,772 source cells were independently compared after import, with half-cent numeric tolerance and 1e-9 percentage tolerance. Do not sum every Total Cost row: the workbook combines alternatives, summaries and details, which would double-count budgets.

The specialized reconstruction lives in lib/budget-inference.mjs; ordinary Excel uploads continue to import workbook contents without automatically applying these workbook-specific assumptions.

The app remains local-only. It does not yet provide authenticated company accounts, role-based permissions or safe concurrent cell merging.
