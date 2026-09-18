# Persisted sheet shape (`sheet`: matrix vs records)

`SpreadsheetControl` persists `{ sheet, derivations }` (see [spreadsheet-formulas.md](./spreadsheet-formulas.md) for `derivations`/formula details, and [computed-fields.md](./computed-fields.md) for how a sibling field addresses one).

## The two orientations

`sheet` can take one of two shapes, driven by which of `x-spreadsheet.columns`/`rows` is declared. `columnHeader`/`rowHeader` only decide whether a leading row/column is skipped first — they never supply keys themselves:

- **Neither `columns` nor `rows` declared:** `sheet` is the raw, address-preserving matrix — an array of rows, each a plain `CellValue[]`. `columnHeader`/`rowHeader` are meaningless here and must not be set true (see the validation matrix below).
- **`columns` declared** (`columnHeader` true or false/absent): row 0 is skipped unread when `columnHeader: true`; otherwise real data starts at row 0. Either way, column `i` of each remaining row maps to `columns[i].id` — assigned strictly by position, never by matching text against `label` or anything else in the file. `label` is display-only, used to render the preview grid's header. For:
  ```json
  "x-spreadsheet": {
    "columnHeader": true,
    "columns": [
      { "id": "item", "label": "Item" },
      { "id": "qty", "label": "Qty" }
    ]
  }
  ```
  an uploaded/positioned `Widget, 10` / `Gadget, 20` persists:
  ```json
  [
    { "item": "Widget", "qty": 10 },
    { "item": "Gadget", "qty": 20 }
  ]
  ```
- **`rows` declared** (`rowHeader` true or false/absent): symmetric, transposed — column 0 is skipped unread when `rowHeader: true`; row `r` of the remaining data maps to `rows[r].id`, one record per _other_ column. For `rows: [{id:'revenue',...}, {id:'cost',...}]` against a sheet with `Q1`/`Q2` across row 1 (or, headerless, starting at row 1), this persists one record per quarter:
  ```json
  [
    { "revenue": 100, "cost": 40 },
    { "revenue": 120, "cost": 55 }
  ]
  ```

Because assignment is positional, the uploaded file's physical column layout must already match the declared `columns`/`rows` order — a skipped header row (`columnHeader: true`) is discarded unread, never validated against `label`.

### Validation matrix

`validateSpreadsheetConfig` (exported from `utils/spreadsheet`) is the single source of truth both `shapeSheet`'s throw and `SpreadsheetControl`'s inline error box use, so the two can never drift into different wording for the same mistake:

| `columnHeader` | `columns`                 | `rowHeader`    | `rows`        | Result                                              |
| -------------- | ------------------------- | -------------- | ------------- | --------------------------------------------------- |
| —              | —                         | —              | —             | valid: raw matrix passthrough                       |
| `true`         | declared                  | —              | —             | valid: records, row 0 skipped                       |
| `false`/absent | declared                  | —              | —             | valid: records, headerless (row 0 is data)          |
| —              | —                         | `true`         | declared      | valid: records, column 0 skipped                    |
| —              | —                         | `false`/absent | declared      | valid: records, headerless (column 0 is data)       |
| `true`         | missing/empty             |                |               | **error**                                           |
|                |                           | `true`         | missing/empty | **error**                                           |
| `true`         |                           | `true`         |               | **error** (both orientations)                       |
|                | declared                  |                | declared      | **error** (both orientations)                       |
| any            | not an array              | any            | any           | **error**, before anything iterates it              |
| any            | `[]` (declared but empty) | any            | any           | **error**, regardless of `columnHeader`/`rowHeader` |
| any            | a duplicate `id`          | any            | any           | **error**                                           |

A malformed `columns`/`rows` (e.g. a schema author's typo leaving it a plain string rather than an array) is checked _first_, before anything downstream ever iterates it — it always surfaces as this same configuration-error message, never as a thrown render exception. An explicitly declared `columns: []`/`rows: []` is rejected the same way in every mode, including headerless — reading it the same as an omitted field would silently fall back to raw matrix persistence instead of the records shape the schema author was clearly trying to declare.

`x-evaluate` addresses cells by literal coordinate (`B2`, `SUM(I2:I6)`), the same as in Excel. Once `columns`/`rows` is declared, a fresh upload is positionally normalized _before_ evaluation runs, so formulas address that canonical matrix. In raw matrix mode (neither declared), formula addressing is exactly the uploaded matrix, unshaped.

## Column order surviving a storage round trip

`recordsToMatrix` (`utils/records.ts`) seeds its header from the declared id list and matches each record's _actual_ keys against it **by name**, not by relying on the record's own key insertion order. So a records array — reloaded from storage, or written straight into the field by an importer — gets re-normalized back to declared order at render/evaluation time regardless of what order its keys happen to be in by the time it arrives (a database is not guaranteed to preserve JS object key insertion order across a round trip). This is separate from the positional-upload assignment above: it protects data that _arrives already keyed by the declared ids_ (a reload, or an importer using the same semantic key names), not a fresh file upload whose physical layout doesn't match `columns`/`rows`.

## Detecting which shape you have

There's no stored discriminant field. Told apart at read time the same way `SpreadsheetControl` itself does — `Array.isArray(sheet[0])`: `true` for a matrix (each row is itself an array), `false` for records (each entry is a plain object). Exported as `isRecordsSheet` from `utils/spreadsheet`. An empty persisted sheet (`[]`) reads as records under this check — harmless, since there's nothing to render either way.

## Duplicate ids

A duplicate `id` within `columns`, or within `rows`, is rejected outright as a static schema-authoring mistake — caught by `validateSpreadsheetConfig` immediately, with no upload needed to discover it. This is unlike a duplicate `x-evaluate` id in the `derivations` map, which collides last-write-wins: an `x-evaluate` id collision is a config mistake reasonable to resolve leniently, but a duplicate declared column/row id means the config itself doesn't actually identify a column/row uniquely, so silently picking a winner would silently misassign real data instead.

## Special keys

- **A declared id of `"__proto__"` is a safe, real key.** Each record is built with `Object.create(null)`, not `{}` — a plain object's inherited `__proto__` setter would otherwise intercept the write and change the record's _prototype_ instead of creating an enumerable own property, silently dropping that column from `Object.keys`/`Object.entries` and from JSON serialization (the same fix already applied to `buildDerivations`' accumulator).
