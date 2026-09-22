# XML export button (`x-xml-export`)

`XmlExportControl` is the reverse of [`XmlControl`](./xml-control.md): instead of parsing an uploaded file into form data, it serializes the data already at its scope into an XML file and downloads it. It's selected the same way every keyword-driven control in this package is — a plain `Control` pointing at a scope whose schema node declares `x-xml-export` — no custom uischema `type` needed.

## What triggers it

The bound schema node must be `type: 'object'` or `type: 'array'` and declare a (non-null) `x-xml-export` object. `XmlExportControlTester` ranks 10, clearing the rank-3 array renderers outright.

## Options

| Option        | Type      | Default        | Meaning                                                                                           |
| ------------- | --------- | -------------- | ------------------------------------------------------------------------------------------------- |
| `rootElement` | `string`  | `'root'`       | Top-level wrapping element name.                                                                  |
| `itemElement` | `string`  | `'item'`       | Element name per entry — only used when the bound schema is `type: 'array'`.                      |
| `fileName`    | `string`  | `'export.xml'` | Downloaded file's name.                                                                           |
| `writeTo`     | `entry[]` | `[]`           | Assemble the document from elsewhere in the form instead of the scoped data verbatim — see below. |
| `writeBase`   | `string`  | `'root'`       | Where `writeTo`'s `from` paths are resolved from — see below.                                     |

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

**`rootElement` is only added when `data` doesn't already have it.** `data` is wrapped as `{ [rootElement]: data }` UNLESS it's already a single-key object whose one key is exactly `rootElement` — which is precisely what a co-located `XmlControl`'s own value looks like (see below): "the field's value IS the parsed document ... its own root element already names it." Wrapping that again would double the root (`<salesData><salesData>...`) instead of re-exporting the document as uploaded, so it's passed through unwrapped in that one case. This check only applies without `writeTo` — a mapping always assembles a fresh object of its own shape, never one that could coincidentally already be the document.

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

## Assembling the document from elsewhere (`writeTo`)

A target XML format almost never matches the form's own JSON shape: different element names, different nesting, values gathered from parts of the form that have nothing to do with each other. `writeTo` maps values _out of_ the form and _into_ the document being built, the mirror image of [`XmlControl`'s own `writeTo`](./xml-control.md#filling-a-form-from-one-upload-writeto), which maps values out of an uploaded document and into the form.

```jsonc
// schema
{
  "type": "object",
  "properties": {
    "customer": { "type": "object", "properties": { "name": { "type": "string" } } },
    "total": { "type": "number" },
    "invoiceExport": {
      "type": "object",
      "x-xml-export": {
        "rootElement": "Invoice",
        "writeTo": [
          { "from": "customer.name", "to": "Party.Name" },
          { "from": "total", "to": "Amount" },
        ],
      },
    },
  },
}
```

```jsonc
// uischema
{ "type": "Control", "scope": "#/properties/invoiceExport" }
```

Given `data = { customer: { name: "Acme" }, total: 120 }`, clicking the button downloads:

```xml
<Invoice>
  <Party><Name>Acme</Name></Party>
  <Amount>120</Amount>
</Invoice>
```

Note that `invoiceExport` itself never appears in the output, and is never read from — once `writeTo` is configured, the scoped field is only where the button lives, not a source of data. `scope` still does the two things it always does: places the Control in the uischema tree, and is what `XmlExportControlTester` matches its `x-xml-export` keyword against.

| Key                  | Meaning                                                                              |
| -------------------- | ------------------------------------------------------------------------------------ |
| `to`                 | Dot-joined path into the document being assembled. Required.                         |
| `from`               | Source path in the form's own data. Mutually exclusive with `inputs`/`formula`.      |
| `inputs` + `formula` | Named sources and an expression over them, for a value gathered from several fields. |
| `as`                 | `string`, `number`, `boolean` or `date`.                                             |
| `format`             | dayjs parse format, `as: "date"` only.                                               |
| `map`                | Substitutes matching values. An unmapped value passes through unchanged.             |
| `default`            | Used when the source is absent.                                                      |

This is the exact same entry shape `x-xml`'s own `writeTo` uses — see [xml-control.md](./xml-control.md#filling-a-form-from-one-upload-writeto) for the full key-by-key behavior (`map`/`as`/`default` order, formula aliasing rules, absent-source handling). The only difference is direction: there, `from` addresses the parsed document and `to` addresses form data; here, `from` addresses form data and `to` addresses the document being built.

### `writeBase` — one exporter per array item

`writeTo`'s `from` paths are **absolute from the form root** by default, the same default `x-xml.writeBase` uses and for the same reason: an exporter placed inside each item of an array shares one schema across every item, so absolute paths would read the same top-level fields for every item's button. `writeBase: "parent"` rebases `from` onto the control's own containing object instead:

```jsonc
// at orders.<i>.exporter
"x-xml-export": {
  "rootElement": "Order",
  "writeBase": "parent",
  "writeTo": [
    { "from": "id", "to": "Id" },
    { "from": "qty", "to": "Qty" }
  ]
}
```

Item 2's button now reads item 2's own `id`/`qty`, never item 1's. As with `x-xml.writeBase`, `"parent"` means the containing _object_, not the array item itself, and on a top-level control it resolves to `''` — the same as `"root"`.

| `writeBase` | `from` is resolved from             |
| ----------- | ----------------------------------- |
| `"root"`    | the form data root (default)        |
| `"parent"`  | the control's own containing object |

## Behavior notes

- The button reads "Download XML" and is disabled whenever there's nothing worth exporting: without `writeTo`, whenever the scoped `data` is `null`/`undefined`, an empty object, or an empty array; with `writeTo`, the same check runs against whatever `writeTo`'s `from` paths read from instead (root data, or the rebased parent under `writeBase: "parent"`) — a cheap, synchronous stand-in for "is there anything to write" that doesn't require resolving every entry just to render a button.
- `fast-xml-parser`'s `XMLBuilder` is lazy-imported on click, never at module load — an app whose forms never export XML doesn't pay to download the builder.
- Output is always pretty-printed (`format: true, indentBy: '  '`) and never emits attributes (`ignoreAttributes: true`) — a download is for a human to read, and exported form data has no `@_`-style attribute keys to worry about.
- This control never writes to form data. Without `writeTo` it has no error state either: building XML from already-valid in-memory data isn't a realistic failure mode the way parsing an untrusted upload is. With `writeTo`, a formula can still fail against real data (the same way `x-xml.writeTo`'s can) — that failure shows as red text next to the button instead of an uncaught rejection, and nothing downloads. It renders nothing when `visible` is `false`, and otherwise renders for a read-only form exactly as it would for an editable one — exporting isn't an edit.

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

Set `rootElement` to the actual root tag of whatever `XmlControl` uploads (e.g. `rootElement: 'salesData'` for a document rooted at `<salesData>`). Because of the "already has its own root" rule above, the export button then re-exports exactly what was parsed — a **round trip**, matching the parsed tree, not a second wrapper added on top of it. It's a round trip rather than a byte-identical copy: attribute/namespace handling differs between `fast-xml-parser`'s parse and build directions.
