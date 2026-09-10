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

| Option             | Type       | Default                         | Meaning                                                    |
| ------------------ | ---------- | ------------------------------- | ---------------------------------------------------------- |
| `accept`           | `string`   | `.xml,text/xml,application/xml` | Accepted file types: MIME types, wildcards, or extensions. |
| `maxSize`          | `number`   | `5242880` (5 MB)                | Max upload size in bytes.                                  |
| `arrayPaths`       | `string[]` | `[]`                            | Elements that must always parse as an array — see below.   |
| `removeNamespaces` | `boolean`  | `false`                         | Strip namespace prefixes from element and attribute names. |

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

To compute over a repeated element inside it, add a sibling `SpreadsheetControl` field pointing at that element with [`x-spreadsheet.sourcePath`](./spreadsheet-value-shape.md#source-mode-x-spreadsheetsourcepath). `XmlControl` deliberately does no evaluation of its own: formulas over an array have nothing to do with the format the array arrived in.

Two things to keep in mind when writing the schema for this field:

1. **`{ "type": "object" }` is the whole schema you need.** The document is an arbitrary shape from an untrusted file, so that is the only honest constraint — and the cheap one: AJV runs with `allErrors: true` on every keystroke anywhere in the form, so a sub-schema here would walk the entire document each time. Narrow it only if you genuinely know the document's shape.
2. **Don't mark the field required** if the upload is optional — removing an uploaded file legitimately clears it.

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
