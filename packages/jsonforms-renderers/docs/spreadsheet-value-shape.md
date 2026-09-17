# Persisted sheet shape (`sheet`: matrix vs records)

`SpreadsheetControl` persists `{ sheet, derivations }` (see [spreadsheet-formulas.md](./spreadsheet-formulas.md) for `derivations`/formula details, and [computed-fields.md](./computed-fields.md) for how a sibling field addresses one).

## Breaking change: migrating from columnHeader-only config

Previously, `x-spreadsheet.columnHeader: true` (or `rowHeader: true`) alone was enough: the uploaded file's own row 1 (or column A) supplied the record keys, read straight from its text. **That no longer happens.** `columnHeader`/`rowHeader` now mean only "skip an extra header row/column in the uploaded file — discard whatever is in it, unread." The sole source of a record's keys is `x-spreadsheet.columns` (or `rows`), a **mandatory**, schema-declared list:

```json
"x-spreadsheet": {
  "columnHeader": true,
  "columns": [
    { "id": "item", "label": "Item" },
    { "id": "qty", "label": "Qty" }
  ]
}
```

Any existing schema with `columnHeader: true` (or `rowHeader: true`) and no `columns` (or `rows`) declared will now render a configuration-error box instead of an upload control, the moment this ships — not a subtle behavior change. Add the declared field list, using the same key names anything downstream (`x-evaluate`, a sibling `x-computed` reading `sheet.N.someKey`) already expects as `id`.

**Why:** a real production bug traced to a database not preserving object key order across a persist/reload round trip (Postgres JSONB is documented to not preserve JS object key insertion order in storage) — a record's keys came back in a different order than uploaded, silently misaligning any `x-evaluate` formula addressing a fixed column letter. Trusting the file's own header text for keys at all made this, and a whole class of similar bugs, possible. A schema-declared, positionally-assigned field list removes it.

**Known, deliberate regression:** previously, an uploaded file whose columns were physically shuffled but correctly _labeled_ still worked, because record keys were read from the file's real header text and then re-matched by name against `columns`. That auto-correction is gone. Assignment is now strictly **positional** — the uploaded file's physical column layout must already match the declared `columns`/`rows` order; a header row above it (when `columnHeader: true`) is only ever skipped, never read or validated against `label`. Concretely:

|                    | Old behavior (by name)                                                                    | New behavior (by position)                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| File's row 1       | `Total Cost, Unit Cost, Quantity, Category, Item` (reversed vs. declared order)           | same                                                                                                                                               |
| Declared `columns` | `['Item', 'Category', 'Quantity', 'Unit Cost', 'Total Cost']`                             | same                                                                                                                                               |
| Result             | Correct — each column matched to its declared id by name, regardless of physical position | **Wrong** — column A gets `id: 'item'` regardless of the file actually holding Total Cost there; the file must physically match declared order now |

## The two orientations

`sheet` can take one of two shapes, driven by which of `columns`/`rows` is declared (`columnHeader`/`rowHeader` only decide whether a leading row/column is skipped first):

- **Neither `columns` nor `rows` declared:** `sheet` is the raw, address-preserving matrix — an array of rows, each a plain `CellValue[]`. Unchanged from before this shape existed. `columnHeader`/`rowHeader` are meaningless here and must not be set true (see the validation matrix below).
- **`columns` declared** (`columnHeader` true or false/absent): row 0 is skipped unread when `columnHeader: true`; otherwise real data starts at row 0. Either way, column `i` of each remaining row maps to `columns[i].id`. For `columns: [{id:'item',...}, {id:'qty',...}]`, an uploaded/positioned `Widget, 10` / `Gadget, 20` persists:
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

### Validation matrix

`validateSpreadsheetConfig` (exported from `utils/spreadsheet`) is the single source of truth both `shapeSheet`'s throw and `SpreadsheetControl`'s inline error box use, so the two can never drift into different wording for the same mistake:

| `columnHeader` | `columns`        | `rowHeader`    | `rows`        | Result                                        |
| -------------- | ---------------- | -------------- | ------------- | --------------------------------------------- |
| —              | —                | —              | —             | valid: raw matrix passthrough                 |
| `true`         | declared         | —              | —             | valid: records, row 0 skipped                 |
| `false`/absent | declared         | —              | —             | valid: records, headerless (row 0 is data)    |
| —              | —                | `true`         | declared      | valid: records, column 0 skipped              |
| —              | —                | `false`/absent | declared      | valid: records, headerless (column 0 is data) |
| `true`         | missing/empty    |                |               | **error**                                     |
|                |                  | `true`         | missing/empty | **error**                                     |
| `true`         |                  | `true`         |               | **error** (both orientations)                 |
|                | declared         |                | declared      | **error** (both orientations)                 |
| any            | not an array     | any            | any           | **error**, before anything iterates it        |
| any            | a duplicate `id` | any            | any           | **error**                                     |

A malformed `columns`/`rows` (e.g. a schema author's typo leaving it a plain string rather than an array) is checked _first_, before anything downstream ever iterates it — it always surfaces as this same configuration-error message, never as a thrown render exception.

**`x-evaluate` formula addressing is affected by `columns`/`rows`, when declared.** Once `columns`/`rows` is declared, a fresh upload is normalized (positionally reordered) _before_ evaluation runs — formulas address that reordered, canonical matrix, not literally "the original, unshaped" upload. Without `columns`/`rows` (raw matrix mode), formula addressing is exactly the original upload, unshaped, as before.

## Column order surviving a database round trip

Declaring `columns`/`rows` is what fixes the original bug, but it's worth understanding _why_ it's still robust even when a database scrambles a record's own key order on the way back out: `recordsToMatrix` (`utils/records.ts`) seeds its header from the declared id list and matches each record's _actual_ keys against it **by name**, not by relying on the record's own key insertion order. So a records array — reloaded from storage, or written straight into the field by an importer — gets re-normalized back to declared order at render/evaluation time regardless of what order its keys happen to be in by the time it arrives. This is separate from, and does not substitute for, the positional-upload requirement above: it protects data that _arrives already keyed by the declared ids_ (a reload, or an importer using the same semantic key names), not a fresh file upload whose physical layout doesn't match `columns`/`rows`.

## Detecting which shape you have

There's no stored discriminant field. Told apart at read time the same way `SpreadsheetControl` itself does — `Array.isArray(sheet[0])`: `true` for a matrix (each row is itself an array), `false` for records (each entry is a plain object). Exported as `isRecordsSheet` from `utils/spreadsheet`. An empty persisted sheet (`[]`) reads as records under this check — harmless, since there's nothing to render either way.

## Duplicate ids

A duplicate `id` within `columns`, or within `rows`, is rejected outright as a static schema-authoring mistake — caught by `validateSpreadsheetConfig` immediately, with no upload needed to discover it. This is unlike a duplicate `x-evaluate` id in the `derivations` map, which collides last-write-wins: an `x-evaluate` id collision is a config mistake reasonable to resolve leniently, but a duplicate declared column/row id means the config itself doesn't actually identify a column/row uniquely, so silently picking a winner would silently misassign real data instead.

## Special keys

A declared `id` is schema-author-controlled, but still built into each record via the same defensive construction as before:

- **A declared id of `"__proto__"` is a safe, real key.** Each record is built with `Object.create(null)`, not `{}` — a plain object's inherited `__proto__` setter would otherwise intercept the write and change the record's _prototype_ instead of creating an enumerable own property, silently dropping that column from `Object.keys`/`Object.entries` and from JSON serialization (the same fix already applied to `buildDerivations`' accumulator).
