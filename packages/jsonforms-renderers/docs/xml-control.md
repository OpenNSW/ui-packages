# XML documents (`x-xml`)

`XmlControl` uploads an XML file, parses it into a plain object, and persists that object. It is generic: it needs no advance knowledge of the document's shape, and `x-xml` configures only how to parse the file.

A field is rendered by `XmlControl` when its schema is `type: "object"` and carries `x-xml`.

```json
{
  "type": "object",
  "title": "Sales Data Document",
  "x-xml": {
    "arrayPaths": ["salesData.sale"]
  }
}
```

See the `xml` fixture in `dev/fixtures.ts` for a complete, runnable example, and `dev/sample-files/sales-data-sample.xml` for the document it uses.

## `x-xml` options

| Option             | Type       | Default                         | Meaning                                                       |
| ------------------ | ---------- | ------------------------------- | ------------------------------------------------------------- |
| `accept`           | `string`   | `.xml,text/xml,application/xml` | Accepted file types: MIME types, wildcards, or extensions.    |
| `maxSize`          | `number`   | `5242880` (5 MB)                | Max upload size in bytes.                                     |
| `arrayPaths`       | `string[]` | `[]`                            | Elements that must always parse as an array — see below.      |
| `removeNamespaces` | `boolean`  | `false`                         | Strip namespace prefixes from element and attribute names.    |
| `writeTo`          | `entry[]`  | `[]`                            | Map values out of the document onto other fields — see below. |
| `persistDocument`  | `boolean`  | `true`                          | Keep the parsed document as this field's own value.           |

## Repeated elements and `arrayPaths`

This is the one option you should not skip. In XML, a container holding one child and a container holding two produce **different shapes at the same path**:

```xml
<contacts><contact><name>A</name></contact></contacts>
```

```json
{ "contacts": { "contact": { "name": "A" } } }
```

```xml
<contacts><contact><name>A</name></contact><contact><name>B</name></contact></contacts>
```

```json
{ "contacts": { "contact": [{ "name": "A" }, { "name": "B" }] } }
```

So a path, a consuming component, or a JSON Schema written against a two-row file breaks on a one-row file, and the failure depends entirely on which file the user happened to upload. Listing the path in `arrayPaths` forces the array shape either way:

```json
"x-xml": { "arrayPaths": ["invoice.contacts.contact"] }
```

```json
{ "contacts": { "contact": [{ "name": "A" }] } }
```

**The shape of your persisted data should be decided by your schema, not by how many rows your user's file happened to have.** List every repeated element you intend to read.

An entry is matched against the parser's own dotted path, which **includes the root element** and never contains array indices — `invoice.contacts.contact`, however many siblings exist. A bare tag name (`contact`) is accepted as a shorthand matching that element at any depth.

## What the parsed document looks like

```xml
<invoice id="INV-1" currency="AUD">
  <header>
    <date>2026-09-09</date>
    <note lang="en">Rush order &amp; partial shipment</note>
  </header>
  <lines>
    <line id="1"><sku>00742</sku><qty>10</qty></line>
  </lines>
</invoice>
```

```json
{
  "invoice": {
    "@_id": "INV-1",
    "@_currency": "AUD",
    "header": {
      "date": "2026-09-09",
      "note": { "#text": "Rush order & partial shipment", "@_lang": "en" }
    },
    "lines": { "line": { "@_id": 1, "sku": "00742", "qty": 10 } }
  }
}
```

Three things to notice:

- **Attributes are kept**, prefixed with `@_`. The prefix keeps them from colliding with a same-named child element.
- **A leaf with no attributes collapses to its bare value** (`"date": "2026-09-09"`), while a leaf that _has_ an attribute becomes an object with a `#text` key. So a leaf's shape can vary from one sibling to the next depending on whether that one element carried an attribute — anything reading these values needs to handle both.
- **`<line>` is an object here**, not an array, because there is only one of it — see [`arrayPaths`](#repeated-elements-and-arraypaths).

The XML declaration, processing instructions and comments are all discarded.

## Value coercion

| XML                 | Parsed value        | Why                                                       |
| ------------------- | ------------------- | --------------------------------------------------------- |
| `<qty>10</qty>`     | `10` (number)       |                                                           |
| `<line qty="10"/>`  | `10` (number)       | Attributes coerce the same way elements do, deliberately. |
| `<sku>00742</sku>`  | `"00742"` (string)  | Leading zeros are preserved — see below.                  |
| `<code>0x1A</code>` | `"0x1A"` (string)   | Hex is not interpreted.                                   |
| `<big>1.5e3</big>`  | `1500` (number)     | Scientific notation is interpreted.                       |
| `<ok>true</ok>`     | `true` (boolean)    |                                                           |
| `<reference/>`      | `""` (empty string) | An empty element has no value to parse.                   |
| `caf&#233;`         | `"café"`            | Numeric character references are decoded.                 |

**Leading zeros are preserved on purpose.** The parser's own default would turn `00742` into `742`, which silently corrupts zero-padded SKUs, postcodes and invoice references — irreversibly, once persisted. Note the consequence: a value's JSON type depends on its content, so a schema narrowing `document` must not assume everything from XML is a string.

There is **no date parsing**: `<date>2026-09-09</date>` stays a string.

## Namespaces

By default, prefixes are preserved as part of the key, along with the `xmlns` declaration:

```xml
<invoice xmlns:meta="urn:example:meta"><meta:generated>…</meta:generated></invoice>
```

```json
{ "invoice": { "@_xmlns:meta": "urn:example:meta", "meta:generated": "…" } }
```

`removeNamespaces: true` strips both, leaving `generated`.

The trade-off is genuine in both directions. Prefixes are chosen by the _document's author_, not fixed by the namespace, so the same document type from two vendors can arrive as `cac:Line` and `ns2:Line` — meaning a path written against one file silently fails on the other. But stripping is lossy: if `<a:Name>` and `<b:Name>` appear in the same parent, both collapse to `Name` and collide. The default is `false` because losing data silently is worse; turn it on when you know the documents use a single namespace.

## Reserved and unsafe names

- `__proto__`, `constructor` and `prototype` as an element or attribute name are **rejected outright**, with a message explaining why. Such a key cannot be represented as an ordinary property, so accepting it would silently drop that element from the persisted data.
- `toString`, `valueOf`, `hasOwnProperty` and the `__define*__`/`__lookup*__` names are **renamed with a `__` prefix** (`<toString>` becomes `__toString`), which keeps them as real, serializable keys.

## Persisted value shape

The field's value **is** the parsed document:

```json
{ "salesData": { "sale": [{ "Item": "Widget A", "Quantity": 500 }] } }
```

There is no wrapper object. The control parses and does nothing else — evaluation lives in a separate field — so there is nothing to store alongside the document, and its own root element already names it.

The value is `undefined` when nothing is uploaded, and again when the file is removed — never `null`, which a `type: "object"` schema would reject and leave the field stuck on "must be object".

The control renders no preview of the parsed document — it goes into the field's value, and that is where to read it.

`XmlControl` deliberately does no evaluation of its own: formulas over an array have nothing to do with the format the array arrived in. To compute over a repeated element, write it into a `SpreadsheetControl` field with `writeTo` — that control evaluates whatever sheet is in its field, whoever put it there.

Two things to keep in mind when writing the schema for this field:

1. **`{ "type": "object" }` is the whole schema you need.** The document is an arbitrary shape from an untrusted file, so that is the only honest constraint — and the cheap one: AJV runs with `allErrors: true` on every keystroke anywhere in the form, so a sub-schema here would walk the entire document each time. Narrow it only if you genuinely know the document's shape.
2. **Don't mark the field required** if the upload is optional — removing an uploaded file legitimately clears it.

## Filling a form from one upload (`writeTo`)

A document almost never matches the shape a form wants: a date arrives as `7/23/26`, an enum as the number `1`, an identifier split across four elements. `writeTo` maps values out of the parsed document onto other fields, so one upload fills a whole form.

```jsonc
"x-xml": {
  "arrayPaths": ["order.line"],
  "persistDocument": false,
  "writeTo": [
    { "from": "order.customer.account_number", "to": "account_ref", "as": "string" },
    { "from": "order.header.order_date", "to": "orders.0.ordered_on", "as": "date", "format": "M/D/YY" },
    { "from": "order.header.priority", "to": "priority", "map": { "1": "high", "0": "normal" } },
    { "from": "order.header.discount", "to": "orders.0.discount", "as": "number", "default": 0 },
    { "from": "order.line", "to": "orders.0.lines.sheet" },
    { "to": "reference_no",
      "inputs": { "ref_office": "order.reference.office", "ref_year": "order.reference.year" },
      "formula": "CONCATENATE(ref_office,\"/\",ref_year)" }
  ]
}
```

| Key                  | Meaning                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| `to`                 | Target data path, resolved per `x-xml.writeBase`. Required.                     |
| `from`               | Source path in the parsed document. Mutually exclusive with `inputs`/`formula`. |
| `inputs` + `formula` | Named sources and an expression over them, for a value the document splits up.  |
| `as`                 | `string`, `number`, `boolean` or `date`.                                        |
| `format`             | dayjs parse format, `as: "date"` only.                                          |
| `map`                | Substitutes matching values. An unmapped value passes through unchanged.        |
| `default`            | Used when the source is absent.                                                 |

Applied in that order: resolve → `map` → `as` → `default`.

### How an importer renders

Configuring `writeTo` changes the layout, because it changes what the control _is_: an action that fills other fields rather than a field that holds a document. It renders as a single small right-aligned **Upload** button, with no drop zone and no drag-and-drop.

**There is no remove, and the button is never relabelled "Replace"** — neither would be honest. This control's writes land in _other_ fields, so removing the document here would leave every field the import filled still filled; and "replace" describes swapping one held thing for another, when what actually happens is a second import overwriting what the first one wrote elsewhere. A plain Upload that overwrites is the only description that matches the behaviour.

`persistDocument` deliberately does **not** affect the layout — it decides what gets stored, not what the control is for. One consequence: with `writeTo` and `persistDocument: true` there is no way to clear the stored document from the UI. If a document needs clearing, what you have is a plain upload field, not an importer — leave `writeTo` off and keep the drop zone.

### `to` is a data path, not a JSON Pointer

JSONForms uses two addressing schemes, and this is the second one:

| Addresses  | Syntax       | Where you see it                                |
| ---------- | ------------ | ----------------------------------------------- |
| the schema | JSON Pointer | `"scope": "#/properties/orders"` in a uischema  |
| the data   | dot-joined   | `ControlProps.path`, `handleChange`, `update()` |

`@jsonforms/core`'s own bridge between them states the rule — `toDataPath('#/properties/foo/properties/bar') === 'foo.bar'`, documented as _"Data paths can be used in field change event handlers like handleChange."_ `writeTo` writes data, so `orders.0.lines.sheet` is what the API consumes; a JSON Pointer there would not resolve.

Paths are **absolute from the form root** by default, where `x-computed.inputs` paths are relative to their own field's parent: a writer normally has to reach anywhere in the form, while a reader stays scoped to its own record so array items cannot read across each other.

### One importer per array item (`writeBase`)

That default breaks down for the one layout where a writer should _not_ reach anywhere: an importer sitting inside each item of an array, where every item's schema is the same schema. Absolute paths there are index-locked — item 2's upload writes `orders.0.*` just like item 1's, silently overwriting it — and the index cannot be varied without a tuple schema, which caps the array's length and is not rendered.

`writeBase: "parent"` resolves every `to` against the control's own containing object instead, the same base `x-computed.inputs` reads from:

```jsonc
// at blendsheet_data.<i>.import_blend_sheet
"x-xml": {
  "writeBase": "parent",
  "persistDocument": false,
  "writeTo": [
    { "from": "BLEND_SHEET.Blend.Blend_number", "to": "blend_no" },
    { "from": "BLEND_SHEET.Particulars_of_sale", "to": "sales.sheet" }
  ]
}
```

`blend_no` now means `blendsheet_data.<i>.blend_no`, so item 2's import can never touch item 1.

| `writeBase` | `to` is resolved from               |
| ----------- | ----------------------------------- |
| `"root"`    | the form data root (default)        |
| `"parent"`  | the control's own containing object |

Two things to hold on to:

- **`parent` is the containing _object_, not the array item.** An importer nested in a sub-object of an item rebases onto that sub-object. Keep it a direct property of the item — the same rule `x-computed` already follows.
- **`from` and `arrayPaths` are unaffected.** They address the parsed document, which has no notion of where in the form the control sits. Only `to` is rebased.

On a top-level control `parent` resolves to `''`, so it behaves exactly like `root`.

A dot-joined path cannot address a key that itself contains a dot — the same limitation noted under [Known scope decisions](#known-scope-decisions) for element names like `<Order.Header>`.

### Things worth knowing

- **`<null/>` is empty, and it parses to an _object_.** `<discount><null/></discount>` becomes `{ "null": "" }`. A non-array object counts as absent, so `default` fills it in — otherwise an object lands in a number field and AJV rejects it with an error the form author cannot act on.
- **A repeated element is written whole.** Arrays are the one object shape that counts as present, because writing rows into a sheet field is the main thing an importer does. `map` and `as` do not apply to them.
- **An absent source with no `default` writes nothing at all.** An importer fills in what its document carries; clearing a field the document is silent about is a different action.
- **A date that doesn't match `format` is treated as absent, never guessed.** Parsing is strict, because a two-digit year is ambiguous otherwise.
- **Formula aliases must not be 1–3 letters and all-alphabetic.** The grammar reads those as spreadsheet column references — use `ref_office`, never `o`. See [computed-fields.md](./computed-fields.md).
- **If one input of a `formula` is missing the whole entry falls back**, rather than composing a value with a hole in it.
- **Nothing is written until every entry resolves.** A mapping that cannot be evaluated reports itself instead of half-filling the form.

## Limits

| Limit                     | Value                         |
| ------------------------- | ----------------------------- |
| Upload size               | `x-xml.maxSize`, 5 MB default |
| Characters after decoding | 5,000,000                     |
| Nesting depth             | 100 elements                  |
| Entity declarations       | 1,000, max 10,000 chars each  |

External and parameter entities are refused, so there is no XXE exposure. A nested entity reference is left literal rather than expanded, which is what makes billion-laughs amplification impossible rather than merely bounded.

## Known scope decisions

- **UTF-8 only.** A document declaring any other encoding is rejected rather than transcoded. Uploaded files are always decoded as UTF-8, so accepting such a document would produce valid-looking but silently wrong text.
- **Mixed content loses inter-element text order.** Text fragments around child elements are concatenated into one `#text` value. This is a data-extraction control, not a document editor.
- **CDATA is indistinguishable from ordinary text** in the output, and is trimmed like any other value. Whether an author wrapped a value in CDATA is an encoding detail, not content.
- **Document order across differently-named siblings is not preserved.** The parsed object is keyed by element name.
- **A value under an element or attribute name containing a `.` cannot be addressed by a dotted path.** Such names are legal XML (some SAP and EDI converters emit `<Order.Header>`), and they parse fine — the value is there in `document`. But `@jsonforms/core`'s path resolution splits on `.` with no escaping mechanism, so a sibling field cannot reach it via `x-computed`.
- **Comments and processing instructions are discarded.**
