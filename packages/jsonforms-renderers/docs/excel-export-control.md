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

Given `data.salesRows = [{ "date": "2026-09-01", "amount": 120 }, { "date": "2026-09-02", "amount": 80 }]`, clicking the button downloads `sales-export.xlsx`, sheet "Sales", with header row `Date of Sale | Amount` and two data rows below it. This exact example is the dev app's **Excel Export (records)** fixture — a standalone records array with no `SpreadsheetControl`/upload involved, as distinct from the **Spreadsheet** fixture's Download Excel button, which re-exports whatever matrix an upload there itself persisted.

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

## Errors

Two separate failure modes, surfaced two different ways — mirroring `SpreadsheetControl`'s own split between a config problem and a runtime one:

- **A malformed `columns`** (not an array, an empty array, or an entry missing a non-empty `id`/`label`) replaces the button entirely with `Invalid x-excel-export config: <reason>`, the same "config error box, checked before anything else renders" rule `SpreadsheetControl` follows for its own `x-spreadsheet.columns`/`rows`. This catches an authoring mistake at render time rather than only when someone happens to click the button.
- **A failure while building the workbook** (`@e965/xlsx` itself rejecting the data, a blocked download, ...) is caught and shown as red text next to the button, rather than an uncaught rejection with nothing visible. The button stays enabled afterward — a failed attempt isn't the same as there being nothing to export.

## Co-locating with an editable array control

By default, declaring `x-excel-export` on an array schema claims that scope entirely: `ExcelExportControlTester` ranks 10, which unconditionally outranks the rank-3 `ArrayControlTester`/`PrimitiveArrayControlTester` this package uses for a normal editable array. A bare `Control` pointing at that scope always renders the export button, never the default list editor.

To get **both** — an editable list of rows, and a button to download them — add a second `Control` at the identical scope, marked `options: { editable: true }`:

```jsonc
// uischema.elements
[
  { "type": "Control", "scope": "#/properties/salesRows" },
  { "type": "Control", "scope": "#/properties/salesRows", "options": { "editable": true } },
]
```

`ExcelExportControlTester` carries an additive `not(optionIs('editable', true))` clause, so it steps aside for the element marked this way and leaves it to the default array renderer — the same `and`/`not`/`optionIs` combinators `XmlControlTester` uses for its own co-location case (see [xml-export-control.md](./xml-export-control.md)), just with the roles reversed: there, the plain element is the DEFAULT control and the marked one is the export button; here, the plain element IS the export button by default, so the marked one opts back INTO the default array control instead.

Without the `editable` option, `x-excel-export` is export-only for that scope — that's the ordinary, common case (just a download button, no editing wanted).
