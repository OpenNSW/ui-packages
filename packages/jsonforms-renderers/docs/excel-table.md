# Excel-sourced tables

Two controls that turn a spreadsheet upload into form data:

- **`ExcelSourceFileControl`** — a `FileControl` that also parses the workbook in the browser.
- **`DataTableControl`** — a read-only grid that displays the parsed rows.

Both are registered in `radixRenderers` and both only activate on an explicit
opt-in, so existing forms are unaffected.

## Why this shape

Users are routinely given a spreadsheet template, fill it in offline, and
upload it. Without this, the file is a dead attachment: the same figures then
get retyped into the form by hand, and nothing downstream can read them.

Parsing happens in the browser, at the moment the file is picked, so the user
sees the extracted table _before_ submitting and can correct the sheet and
re-upload. The file still uploads exactly as it did — same storage key, same
`UploadProvider` contract. Nothing about the upload path changes.

## Declaring it

Everything is driven from the JSON schema. The package contains no column
names, formulas, or domain knowledge.

```jsonc
{
  "sales_file": {
    "type": "string",
    "format": "file",
    "title": "Upload Sales Sheet",
    "x-file": { "accept": ".xlsx" },
    "x-excel": {
      // Sibling array field the parsed rows are written to.
      "target": "sales",

      // How to recognise each column. Header text is matched
      // case/space/punctuation-insensitively, so "Rate\nPer KG",
      // "RATE PER KG" and "Rate per Kg." all match "rate per kg".
      "columns": {
        "date_of_sale": { "match": ["date of sale", "sale date"], "type": "date", "required": true },
        "garden_mark": { "match": ["garden mark", "garden"], "type": "string" },
        "quantity_kg": { "match": ["qty in kg", "quantity in kg"], "type": "number", "required": true },
        "total_value": { "match": ["total value rs", "total value"], "type": "number" },
      },

      // Sibling fields computed from the parsed rows.
      "derive": {
        "total_quantity_kg": { "op": "sum", "column": "quantity_kg" },
        "avg_rate_per_kg": {
          "op": "ratio",
          "numerator": "total_value",
          "denominator": "quantity_kg",
          "precision": 2,
        },
        "dominant_grade": { "op": "dominant", "column": "grade", "weightBy": "quantity_kg" },
      },
    },
  },
}
```

Then point a `DataTableControl` at the target array:

```jsonc
{
  "type": "Control",
  "scope": "#/properties/sales",
  "options": { "table": true, "totals": ["quantity_kg", "total_value"] },
}
```

Mark `target` and every derived property `readOnly` in the schema — they are
written by the parse, not typed.

## Derivation operators

| `op`       | Result                                                                        |
| ---------- | ----------------------------------------------------------------------------- |
| `sum`      | Total of `column`.                                                            |
| `ratio`    | `SUM(numerator) / SUM(denominator)`, rounded to `precision` (default 2).      |
| `dominant` | The `column` value carrying the most `weightBy`. Exact ties are comma-joined. |
| `count`    | Number of parsed rows.                                                        |

`sum` and `ratio` yield **undefined** rather than `0` when no row supplies a
usable number — a column the sheet omits entirely must not be reported as a
real figure of zero.

## What the parser tolerates

- **Banner rows above the grid.** The header row is found by scoring every row
  in the first 25 (`headerSearchRows`) against the declared columns and taking
  the best match, rather than assuming row 1.
- **Reordered or extra columns.** Columns are located by header text, not
  position. Unmatched declared columns are reported in `missingColumns` and
  surfaced to the user.
- **Blank spacer rows**, and rows missing a `required` column — skipped and
  counted in `skippedRows`.
- **Trailing `TOTAL` / `GRAND TOTAL` rows** — recognised and excluded, so their
  figures never enter the aggregates. Matched against the whole cell, so a
  value like `TOTAL ESTATE` is still treated as data.
- **`dd/mm/yyyy` text dates and comma-grouped numbers** — normalised to ISO
  dates and plain numbers.

A sheet with no recognisable header row raises an error. The file still
uploads: the attachment is usually wanted regardless, and the user can fall
back to whatever manual fields the form offers.

## Notes

- Only `.xlsx` / `.xlsm` are parsed. Other files on the same field upload
  normally and clear any previously parsed table.
- Removing the uploaded file clears the target array and the derived fields.
- `read-excel-file` is loaded with a dynamic `import()`, so applications that
  use this renderer set without any `x-excel` field don't pay for it.
- `parseSheetGrid(grid, spec)` is exported separately from `parseExcelTable`
  for testing the parse against a grid from any source.
