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

A duplicate header value (`columnHeader`) or duplicate column-A value (`rowHeader`) is rejected outright — `shapeSheet` throws (caught the same way `SpreadsheetControl` already catches a parse failure, surfacing a configuration-error message instead of rendering anything). This is unlike a duplicate `x-evaluate` id in the `derivations` map, which collides last-write-wins: an `x-evaluate` id is schema-author-controlled, so a collision there is a config mistake reasonable to resolve leniently, but a header/column-A value comes from whatever's in the uploaded file — a collision there means the file itself doesn't actually identify a column/row uniquely, so silently picking a winner would silently drop real data instead.

A blank/null header (or column-A) cell contributes no key at all, rather than a stringified `"null"`/`""` — that column (or row, for `rowHeader`) is simply absent from every record.

## Special keys

Unlike a schema-author-controlled `x-evaluate` id, a header/column-A value comes from whatever's in the uploaded file, so two edge cases get handled explicitly rather than assumed away:

- **A header value of `"__proto__"` is a safe, real key.** Each record is built with `Object.create(null)`, not `{}` — a plain object's inherited `__proto__` setter would otherwise intercept the write and change the record's _prototype_ instead of creating an enumerable own property, silently dropping that column from `Object.keys`/`Object.entries` and from JSON serialization (the same fix already applied to `processMatrix`'s `derivations` accumulator).
- **A `Date` header/column-A value keys deterministically.** Keys are built via `date.toISOString()` for `Date` cells, not `String(date)` — the latter renders in the _local_ time zone, which would make the same uploaded file produce different record keys depending on which time zone the uploading browser is in.

## See also

`XmlControl` uploads and parses XML documents. Pair it with a `sourcePath` field to compute over what it parsed. See [xml-control.md](./xml-control.md).

## Reading from another field (`x-spreadsheet.sourcePath`)

Set `sourcePath` and the control takes its data from elsewhere in the form instead of from an upload — a dotted path, relative to the field's own parent object, exactly as [`x-computed.inputs`](./computed-fields.md) paths are. There is no upload, replace or remove.

```json
"x-spreadsheet": { "sourcePath": "sales_document.salesData.sale" },
"x-evaluate": [{ "id": "total_quantity", "label": "Total Quantity", "expression": "=SUM(D2:D4)" }]
```

**By default the persisted value is `{ derivations }`, with no `sheet`** — so the sub-schema shrinks to:

```json
"properties": { "derivations": { "type": "object", "additionalProperties": { "$ref": "#/$defs/result" } } }
```

That is a _default_, not a restriction: `persistSheet` works here exactly as it does for an upload, and setting it to `true` stores a shaped `sheet` alongside `derivations`, keyed by `columnHeader`/`rowHeader` in the usual way.

What differs is which default avoids the obvious mistake, and that follows **who owns the rows**:

| Source       | `persistSheet` default | Why                                                                                                          |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| upload       | `true`                 | This field holds the only copy. Omitting it loses the data.                                                  |
| `sourcePath` | `false`                | The rows already live at the source path in the same submission. Persisting them again writes a second copy. |

Turning it on for a path source is worth it when the copy is a **transformation** rather than a duplicate — a 2-D source with `columnHeader: true` persists records, a shape that exists nowhere else in the document — or when you deliberately want a snapshot of what the derivations were computed from.

Note the snapshot is of the _current_ source: if the source becomes unavailable, the field clears completely rather than keeping a sheet that no longer matches anything. A field with neither `x-evaluate` nor `persistSheet` writes nothing at all, which makes it usable as a plain "render this array" display that can't dirty a form.

**The source can be either shape**, told apart exactly as a persisted `sheet` is:

- a **2-D array** — passed to the engine untouched and addressed literally, just like an uploaded sheet;
- an **array of objects** — flattened to a header row of field names plus one row per record, so the data starts at row 2.

It need not come from XML. An `ArrayControl`'s items, or another spreadsheet field's records-shaped `sheet`, work identically.

Only `accept`, `maxSize` and `sheetName` are inert here — they describe how to read a _file_, so there is nothing for them to do. They are ignored rather than rejected, since they are usually leftovers from a converted field.

Everything else means exactly what it means for an upload. `columnHeader`, `rowHeader`, `showSheet`, `persistSheet` and `x-evaluate` all describe what to do with the rows once they arrive, and none of them has any business caring where they came from.

### Host requirement: don't feed `onChange` back into `data`

A `sourcePath` field persists from an **effect**, when the data it watches changes — not from a user event. That makes it sensitive to how the host wires `JsonForms`.

`JsonForms` replaces its internal state whenever its `data` **prop** changes. So the common-looking round-trip

```jsx
// WRONG — loses writes
<JsonForms data={data} onChange={({ data }) => setData(data)} … />
```

opens a window in which the internal state has advanced past the prop, and the next prop sync reverts it. The symptom is specific and confusing: the table renders from data that is plainly there, but `derivations` never appears in the form value — and a downstream `x-computed` field may briefly show a value computed from derivations that no longer exist.

Treat the `data` prop as a **seed**, and set it deliberately — on mount, or when loading a different record — rather than on every change:

```jsx
<JsonForms data={seed} onChange={({ data }) => setLiveData(data)} … />
```

`dev/main.tsx` does exactly this. `ComputedControl` persists from an effect too and has the same exposure, so this applies to any form that chains computed fields.

When the path resolves to nothing the field reads "No data available yet" and writes nothing; when it resolves to something that isn't rows it says so; when it resolves to an empty list the formulas are skipped rather than run over an empty grid, which would otherwise report `#ERROR!` on every entry and read as a broken formula.
