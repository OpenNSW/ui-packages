// Shared data contract for the XML parsing utilities. Imported by every other
// file in this folder and re-exported via index.ts.

// A leaf value inside a parsed document. Deliberately NOT the formula engine's
// CellValue: fast-xml-parser does no date parsing at all, so Date is unreachable
// here and including it would invite null-checks for a case that cannot happen.
// `null` is included because a document read back from JSON storage can hold it.
export type XmlPrimitive = string | number | boolean | null

export type XmlNode = XmlPrimitive | XmlNode[] | { [key: string]: XmlNode }

// A whole parsed document: always an object, keyed by its root element name.
export type XmlDocument = { [key: string]: XmlNode }

// XmlControl persists the parsed document as the field's value directly, with no
// wrapper object. There is nothing else for the control to store: it parses, and
// evaluation belongs to a separate field (see x-spreadsheet.sourcePath), so a
// wrapper would only namespace the value against siblings that will never exist
// — and the document's own root element already names it.
//
// The value is `undefined` — never `null` — when nothing is uploaded, and that
// is what removing an uploaded file writes back: a `type: 'object'` schema does
// not accept null, so writing one would leave the field stuck on "must be
// object".
