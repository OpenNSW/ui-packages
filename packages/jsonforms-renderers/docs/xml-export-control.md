# XML export button (`x-xml-export`)

`XmlExportControl` is the reverse of [`XmlControl`](./xml-control.md): instead of parsing an uploaded file into form data, it serializes the data already at its scope into an XML file and downloads it. It's selected the same way every keyword-driven control in this package is — a plain `Control` pointing at a scope whose schema node declares `x-xml-export` — no custom uischema `type` needed.

## What triggers it

The bound schema node must be `type: 'object'` or `type: 'array'` and declare a (non-null) `x-xml-export` object. `XmlExportControlTester` ranks 10, clearing the rank-3 array renderers outright.

## Options

| Option        | Type     | Default        | Meaning                                                                      |
| ------------- | -------- | -------------- | ---------------------------------------------------------------------------- |
| `rootElement` | `string` | `'root'`       | Top-level wrapping element name.                                             |
| `itemElement` | `string` | `'item'`       | Element name per entry — only used when the bound schema is `type: 'array'`. |
| `fileName`    | `string` | `'export.xml'` | Downloaded file's name.                                                      |

## Object scope — export a single subtree

```jsonc
// schema
{
  "type": "object",
  "properties": {
    "invoice": {
      "type": "object",
      "properties": { "customer": { "type": "string" }, "total": { "type": "number" } },
      "x-xml-export": { "rootElement": "invoice", "fileName": "invoice.xml" },
    },
  },
}
```

```jsonc
// uischema
{ "type": "Control", "scope": "#/properties/invoice" }
```

Given `data.invoice = { "customer": "Acme", "total": 1200 }`, clicking the button downloads:

```xml
<invoice>
  <customer>Acme</customer>
  <total>1200</total>
</invoice>
```

An array _nested inside_ an object scope (e.g. `invoice.lines`) needs no extra config — the builder already repeats that array's own key as the sibling tag per entry.

## Array scope — export a list of records

```jsonc
// schema
{
  "type": "object",
  "properties": {
    "orders": {
      "type": "array",
      "items": { "type": "object", "properties": { "id": { "type": "string" }, "qty": { "type": "number" } } },
      "x-xml-export": { "rootElement": "orders", "itemElement": "order", "fileName": "orders.xml" },
    },
  },
}
```

```jsonc
// uischema
{ "type": "Control", "scope": "#/properties/orders" }
```

Given `data.orders = [{ "id": "1", "qty": 2 }, { "id": "2", "qty": 5 }]`, clicking downloads:

```xml
<orders>
  <order><id>1</id><qty>2</qty></order>
  <order><id>2</id><qty>5</qty></order>
</orders>
```

A bare array has no key of its own to repeat, which is why the array case wraps each entry under `itemElement` first, then the whole thing under `rootElement` — unlike the object case, where `data` is wrapped just once.

## Behavior notes

- The button reads "Download XML" and is disabled whenever there's nothing worth exporting: `data` is `null`/`undefined`, an empty object, or an empty array.
- `fast-xml-parser`'s `XMLBuilder` is lazy-imported on click, never at module load — an app whose forms never export XML doesn't pay to download the builder.
- Output is always pretty-printed (`format: true, indentBy: '  '`) and never emits attributes (`ignoreAttributes: true`) — a download is for a human to read, and exported form data has no `@_`-style attribute keys to worry about.
- This control never writes to form data and has no error state: building XML from already-valid in-memory data isn't a realistic failure mode the way parsing an untrusted upload is. It renders nothing when `visible` is `false`, and otherwise renders for a read-only form exactly as it would for an editable one — exporting isn't an edit.

## Placing it next to another control at the same scope

Unlike `SpreadsheetControl` (whose persisted value has a `sheet` sub-property an export button can point at instead of the parent), `XmlControl`'s whole field _is_ the parsed document — there's no sub-property to give a second control a different scope. To show "here's what was uploaded, and here's a re-export of it" side by side, use **two** `Control` elements at the identical `scope`, and mark the second one with `options: { export: true }`:

```jsonc
// uischema.elements
[
  { "type": "Control", "scope": "#/properties/sales_data" },
  { "type": "Control", "scope": "#/properties/sales_data", "options": { "export": true } },
]
```

Without the `export` option, both elements would resolve to the same renderer — `XmlControlTester` and `XmlExportControlTester` are both schema-only testers at rank 10, so two elements at the same scope would tie and @jsonforms/react's tie-break (registration order) would render the **same** control for both. `XmlControlTester` carries an additive `not(optionIs('export', true))` clause specifically so it steps aside for the element marked this way, letting `XmlExportControlTester` win only that one. This is a supported, documented pattern — not a fixture-only trick — for pairing an upload control with a "download what's here" button on the same field.
