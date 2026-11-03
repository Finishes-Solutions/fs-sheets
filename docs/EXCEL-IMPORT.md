# Excel exports and local planning

The app retains row locking next to proofing, conditional and manual formatting, three-key sibling sorting, formulas, requests, local automations, saved filters, column visibility, mentions, and 30 column types. Existing limits and local-only collaboration boundaries in README.md still apply.

## Planning tools

- **Portfolios:** choose source sheets and exact field names for status, cost, and due dates. Rollups exclude hierarchy parents to avoid counting parent totals twice. Different source field names require separate portfolios or standardized columns.
- **Scenario planning:** choose source sheets, save overrides, select projects, and compare budget/effort constraints. A priority-first recommendation proposes a feasible selection. Applying a plan is explicit and checks source values and locks.
- **DataTables:** ingest CSV records by key, append or replace table data, map filtered fields into target sheets, and run automatic or manual connections. Source snapshots and independent sheet copies remain available. Local tables are not Smartsheet's hosted large-scale DataTable service.
- **Dynamic View:** select source fields, editable/required fields, row filters and conditional hidden/read-only/required rules. The server validates view edits and projections. Defaults to read-only. Source row locks and calculated fields remain protected. These views organize local work; they do not provide authenticated row-level access or private sharing. All local clients can still access the source API.

All definitions persist in SQLite and project JSON backups. Delete removes a definition without deleting source sheets. Scenario changes never apply automatically to live sheets. Sheets use 50-row pages; searching, filtering, and sorting operate on all rows. Selecting all selects all matching rows, including other pages.

## Importing Excel exports

The supplied archive was imported into a separate **Imported Smartsheet exports** workspace. Existing data was retained; a pre-import JSON backup is in ignored `backups/`. Uploaded business data and generated bundles remain in ignored local storage and are not committed to Git.

| Workbook | Data rows | Columns | Mapped comments | Unmapped records |
| --- | ---: | ---: | ---: | ---: |
| PO_PRF_RUSH Request - New System | 1,710 | 94 | 298 | 34 |
| FS-007 - .8 Acres - Schedule | 249 | 11 | 0 | 0 |
| FS-007 - .8 Acres | 1,722 | 23 | 456 | 3 |

203,085 exported cell positions were compared with the originals, and every nonempty exported comment record was accounted for. Data rows include blank rows within each workbook's used range to retain row-number mapping. Comments labeled `Row N` map to data row N (Excel row N+1). Records without a usable row label are retained in each sheet's **Import notes** dialog. Comment authors and original timestamp text are retained.

The workbooks contain **zero formula definitions and zero conditional-formatting rules**. Exported calculated values and static styling were imported; the original calculations, automation rules, permissions, attachments, proofs, and conditional rules cannot be recovered from these files. The user confirmed original formula/rule definitions are currently unavailable. No definitions were invented.

Imports retain text/numeric/boolean/date values, cell fill and font colors, bold/italic/underline/strike, alignment/wrapping/font size, widths, hidden columns, and hierarchy inferred from indentation. Timestamp values retain their exported precision as text. Original workbook names, worksheet names, SHA-256 hashes, row numbers, hidden-row flags, row heights, original headers, and merged-range metadata are retained for inspection. Row heights, hidden-row flags, and merged ranges are metadata only. Imported font families, point-scaled sizes and supported borders are rendered. Excel number-format patterns, print layouts, and arbitrary Excel features do not have exact rendering parity. The original ZIP remains the lossless source.

To convert another compatible archive locally, use Python with `openpyxl` installed:

```sh
cd /workspace/fs-sheets
python scripts/import_excel.py /path/to/exports.zip data/imports/new-export
```

Choose **Overview → Import → Excel export bundle**, then select the generated `excel-import.json`. Import adds a workspace and preserves existing sheets. The generated report contains counts and evidence boundaries. Do not import the same bundle twice. The converter handles the first worksheet as sheet data and named Comments/Summary worksheets as supporting exports. It never executes workbook text, macros, or formulas. It is tailored to these Smartsheet exports, not a general Excel calculation engine; native Excel A1 formulas are retained as source strings but are not translated to the app's named-column formula language.

Project saves remain limited to 64 MB. Local DataTables and embedded attachments share that limit; this implementation is not a hosted replacement for all Smartsheet products.

Subsequent formula reconstruction: nine evidence-backed column formulas were inferred and installed while preserving raw export values and exceptional rows. These are not original definitions. See [Formula evidence and controls](FORMULAS.md).

Connected ingestion, scenario constraints, and server-validated Dynamic View field rules are now implemented; see [current coverage](REQUEST-COVERAGE.md) for the expanded workflows.
