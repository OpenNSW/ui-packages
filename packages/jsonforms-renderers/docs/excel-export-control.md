# Excel export button (`x-excel-export`)

`ExcelExportControl` is a `Control` renderer that serializes the array at its scope to a workbook and downloads it, via [`@e965/xlsx`](https://www.npmjs.com/package/@e965/xlsx) (the same SheetJS fork `SpreadsheetControl` already depends on). Unlike `SpreadsheetControl`, it never writes to form data — it only reads.

## What triggers it

The renderer is selected automatically from the schema, the same way `SpreadsheetControl` is: a plain `Control` pointing at a `type: 'array'` schema node that declares `x-excel-export`.

```jsonc
// schema
{
  "type": "object",
  "properties": {
    "salesRows": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "date": { "type": "string" },
          "amount": { "type": "number" },
        },
      },
      "x-excel-export": {
        "columns": [
          { "id": "date", "label": "Date of Sale" },
          { "id": "amount", "label": "Amount" },
        ],
        "sheetName": "Sales",
        "fileName": "sales-export.xlsx",
      },
    },
  },
}
```

```jsonc
// uischema
{ "type": "Control", "scope": "#/properties/salesRows" }
```

Given `data.salesRows = [{ "date": "2026-09-01", "amount": 120 }, { "date": "2026-09-02", "amount": 80 }]`, clicking the button downloads `sales-export.xlsx`, sheet "Sales", with header row `Date of Sale | Amount` and two data rows below it.

## `x-excel-export` options

| Option      | Type                                                                              | Default                    | Meaning                                                                                                                                                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `columns`   | `SpreadsheetFieldSpec[]` (`{ id, label }`, same shape as `x-spreadsheet.columns`) | _(none)_                   | Declared column id/label list, in order. `id` pins column identity/order. Omitted → falls back to the union of every record's own keys, first-seen order (same rule `recordsToMatrix` already applies). Only meaningful on the records path — see below. |
| `sheetName` | `string`                                                                          | `'Sheet1'`                 | Worksheet name. Ignored when `fileType` is a non-sheeted format (e.g. `csv`).                                                                                                                                                                            |
| `fileType`  | `'xlsx' \| 'xls' \| 'csv' \| 'ods'`                                               | `'xlsx'`                   | Output format, passed straight through as `@e965/xlsx`'s own `bookType`.                                                                                                                                                                                 |
| `fileName`  | `string`                                                                          | `` `export.${fileType}` `` | Downloaded file's name. Defaults to match `fileType`'s extension so the two never mismatch.                                                                                                                                                              |

**Future formats are a config change, not a redesign.** `@e965/xlsx`'s own `BookType` union includes far more than the four exposed here (`xlsm`, `xlsb`, `html`, `dbf`, and others). Widening `fileType` later is a one-line type change plus an options-table update — the write call itself (`writeFile(workbook, fileName, { bookType: fileType })`) already forwards whatever is passed, which is why this control calls the generic `writeFile` rather than the xlsx-only `writeFileXLSX` shortcut.

## Matrix vs records — both shapes `SpreadsheetControl` can persist

The scoped `data` can arrive as either shape `SpreadsheetControl`'s own `SheetData` type allows, told apart with `isRecordsSheet` (the exact same check `SpreadsheetControl` itself uses):

- **A plain matrix** (`CellValue[][]`, row 0 already a header or not, per `x-spreadsheet.columnHeader`): already rectangular and ready for `aoa_to_sheet` as-is — written through unchanged. `columns` has no header row to relabel here, so it's ignored entirely on this path.
- **An array of records** (`Record<string, CellValue>[]`): flattened with `recordsToMatrix` (the same helper `SpreadsheetControl` uses), seeded with `columns.map(c => c.id)` when `columns` is declared. If `columns` is also declared, the resulting header row's ids are then swapped for their `label`s — falling back to the id itself for any extra key `recordsToMatrix` appended that wasn't in the declared list. This matches this package's existing convention that `label` is display-only and never affects data identity (see [spreadsheet-value-shape.md](./spreadsheet-value-shape.md)).

This isn't extra scope for its own sake — it's what makes the button a faithful re-export of whatever a `SpreadsheetControl` field actually persisted, which is the point of pointing it at that field.

## Rendering

The field label, then one `Button` reading "Download Excel", `disabled` when `data` isn't a non-empty array. No `useClearWhenHidden`, no `isEditable`/`canEdit` gating — this control never writes to form data, so a read-only form can still export it. `visible: false` renders nothing.
