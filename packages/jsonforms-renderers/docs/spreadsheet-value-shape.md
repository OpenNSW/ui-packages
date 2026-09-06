# Persisted sheet shape (`sheet`: matrix vs records)

`SpreadsheetControl` persists `{ sheet, derivations }` (see [spreadsheet-formulas.md](./spreadsheet-formulas.md) for `derivations`/formula details, and [computed-fields.md](./computed-fields.md) for how a sibling field addresses one). `sheet` itself can take one of two shapes, driven entirely by the existing `x-spreadsheet.columnHeader`/`rowHeader` options — no separate switch:

```json
"x-spreadsheet": { "columnHeader": true }
```

- **Neither flag set (default):** `sheet` is the raw, address-preserving matrix — an array of rows, each a plain `CellValue[]`. Unchanged from before this shape existed.
- **`columnHeader: true`:** row 1 is treated as each column's field name; every row after it becomes one record. For a header of `Item, Qty`, uploading `Widget, 10` / `Gadget, 20` persists:
  ```json
  [
    { "Item": "Widget", "Qty": 10 },
    { "Item": "Gadget", "Qty": 20 }
  ]
  ```
- **`rowHeader: true`** (and `columnHeader` not also set): transposed — column A is treated as each row's field name; every _other_ column becomes one record. For a sheet with `Metric` down column A (`Revenue`, `Cost`) and `Q1`/`Q2` across row 1, this persists one record per quarter:
  ```json
  [
    { "Metric": "Q1", "Revenue": 100, "Cost": 40 },
    { "Metric": "Q2", "Revenue": 120, "Cost": 55 }
  ]
  ```
- **Both set is rejected outright** — `SpreadsheetControl` shows a configuration-error message instead of rendering anything (no preview, no corner label), and the underlying `shapeSheet` helper throws if called directly. Each orientation is independently meaningful in real usage, so there's no safe default to silently pick; a schema author must choose exactly one.

**`x-evaluate` formula addressing is completely unaffected.** `B2`, `SUM(I2:I6)`, etc. always address the original, unshaped matrix — shaping only happens afterward, when building the persisted value.

## Detecting which shape you have

There's no stored discriminant field. Told apart at read time the same way `SpreadsheetControl` itself does — `Array.isArray(sheet[0])`: `true` for a matrix (each row is itself an array), `false` for records (each entry is a plain object). Exported as `isRecordsSheet` from `utils/spreadsheet`. An empty persisted sheet (`[]`) reads as records under this check — harmless, since there's nothing to render either way.

## Duplicate keys

A duplicate header value (`columnHeader`) or duplicate column-A value (`rowHeader`) collides last-write-wins in every affected record — the same convention already used for a duplicate `x-evaluate` id colliding in the `derivations` map. Not flagged as an error either place; ids/headers are schema-author-controlled.

A blank/null header (or column-A) cell contributes no key at all, rather than a stringified `"null"`/`""` — that column (or row, for `rowHeader`) is simply absent from every record.

## Special keys

Unlike a schema-author-controlled `x-evaluate` id, a header/column-A value comes from whatever's in the uploaded file, so two edge cases get handled explicitly rather than assumed away:

- **A header value of `"__proto__"` is a safe, real key.** Each record is built with `Object.create(null)`, not `{}` — a plain object's inherited `__proto__` setter would otherwise intercept the write and change the record's _prototype_ instead of creating an enumerable own property, silently dropping that column from `Object.keys`/`Object.entries` and from JSON serialization (the same fix already applied to `processMatrix`'s `derivations` accumulator).
- **A `Date` header/column-A value keys deterministically.** Keys are built via `date.toISOString()` for `Date` cells, not `String(date)` — the latter renders in the _local_ time zone, which would make the same uploaded file produce different record keys depending on which time zone the uploading browser is in.
