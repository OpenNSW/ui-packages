# XML export button (`x-xml-export`)

`XmlExportControl` is the reverse of [`XmlControl`](./xml-control.md): instead of parsing an uploaded file into form data, it assembles a document from elsewhere in the form and downloads it as XML. It's selected the same way every keyword-driven control in this package is — a plain `Control` pointing at a scope whose schema node declares `x-xml-export` — no custom uischema `type` needed. Unlike most other controls, though, it never reads the data at the scope it's bound to: that scope only hosts this config and places the button, the same way an importer's own field does when `x-xml.writeTo` distributes everything it parses elsewhere.

## What triggers it

The bound schema node must be `type: 'object'` and declare a (non-null) `x-xml-export` object. `XmlExportControlTester` ranks 10, clearing the rank-3 array renderers and the default object/Group renderer outright.

## Options

| Option        | Type      | Default        | Meaning                                                        |
| ------------- | --------- | -------------- | -------------------------------------------------------------- |
| `rootElement` | `string`  | `'root'`       | Top-level wrapping element name.                               |
| `fileName`    | `string`  | `'export.xml'` | Downloaded file's name.                                        |
| `writeTo`     | `entry[]` | _(required)_   | Assembles the document from elsewhere in the form — see below. |
| `writeBase`   | `string`  | `'root'`       | Where `writeTo`'s `from` paths are resolved from — see below.  |

## Assembling the document (`writeTo`)

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

Note that `invoiceExport` itself never appears in the output, and is never read from — the scoped field is only where the button lives. `scope` still does the two things it always does: places the Control in the uischema tree, and is what `XmlExportControlTester` matches its `x-xml-export` keyword against.

| Key                  | Meaning                                                                              |
| -------------------- | ------------------------------------------------------------------------------------ |
| `to`                 | Dot-joined path into the document being assembled. Required.                         |
| `from`               | Source path in the form's own data. Mutually exclusive with `inputs`/`formula`.      |
| `inputs` + `formula` | Named sources and an expression over them, for a value gathered from several fields. |
| `as`                 | `string`, `number`, `boolean` or `date`.                                             |
| `format`             | dayjs parse format, `as: "date"` only.                                               |
| `map`                | Substitutes matching values. An unmapped value passes through unchanged.             |
| `default`            | Used when the source is absent.                                                      |
| `writeTo`            | When `from` resolves to an array, reshapes each item — see below.                    |

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

## Reshaping an array (nested `writeTo`)

By default, when `from` resolves to an array (e.g. a `SpreadsheetControl`-backed set of line-item records), it's carried through to `to` **verbatim**, original field names and all:

```jsonc
{ "from": "lines.sheet", "to": "Lines.Line" }
```

If `lines.sheet` holds `[{ "sku": "A-1", "qty": 10 }]`, the output is `<Lines><Line><sku>A-1</sku><qty>10</qty></Line></Lines>` — not `<SKU>`/`<Quantity>`, even if that's what the target format needs.

Nest another `writeTo` directly on the entry to reshape each array item instead — the exact same directive `x-xml`'s own importer-side `writeTo` uses for a repeating XML element (see [xml-control.md](./xml-control.md#reshaping-a-repeated-element-nested-writeto)), since both controls resolve entries through the same shared function:

```jsonc
{
  "from": "lines.sheet",
  "to": "Lines.Line",
  "writeTo": [
    { "from": "sku", "to": "SKU" },
    { "from": "qty", "to": "Quantity" },
  ],
}
```

Given the same data, this now downloads `<Lines><Line><SKU>A-1</SKU><Quantity>10</Quantity></Line></Lines>`. As on the import side, a nested `writeTo` only makes sense once `from` actually resolves to an array — if it resolves to a single value instead, the entry throws rather than silently writing that value unreshaped.

**When the array items already use the target names** — e.g. by configuring `SpreadsheetControl`'s own `x-spreadsheet.columns[].id` upstream so the _stored_ records already match — a plain `writeTo` entry with no nested `writeTo` still passes them through unchanged, exactly as before.

## Behavior notes

- The button reads "Download XML." A missing, non-array, or empty `writeTo` is a config error, shown as a red inline box (`Invalid x-xml-export config: …`) in place of the button — checked before anything else renders, the same "config problem vs. runtime problem" split `SpreadsheetControl` follows for its own `x-spreadsheet.columns`/`rows`.
- Past that, the button is disabled whenever there's nothing worth exporting: the data `writeTo`'s `from` paths read from (root data, or the rebased parent under `writeBase: "parent"`) is `null`/`undefined`, an empty object, or an empty array — a cheap, synchronous stand-in for "is there anything to write" that doesn't require resolving every entry (formula evaluation is async) just to render a button.
- `fast-xml-parser`'s `XMLBuilder` is lazy-imported on click, never at module load — an app whose forms never export XML doesn't pay to download the builder.
- Output is always pretty-printed (`format: true, indentBy: '  '`) and never emits attributes (`ignoreAttributes: true`) — a download is for a human to read, and exported form data has no `@_`-style attribute keys to worry about.
- This control never writes to form data. A formula that fails against real data shows as red text next to the button instead of an uncaught rejection, and nothing downloads. It renders nothing when `visible` is `false`, and otherwise renders for a read-only form exactly as it would for an editable one — exporting isn't an edit.
