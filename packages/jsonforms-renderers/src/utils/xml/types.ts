// Shared data contract for the XML parsing utilities.

// A leaf value inside a parsed document. `null` is included because a document
// read back from JSON storage can hold it.
export type XmlPrimitive = string | number | boolean | null

export type XmlNode = XmlPrimitive | XmlNode[] | { [key: string]: XmlNode }

// A whole parsed document, and the field's persisted value: XmlControl stores
// the parsed object directly, so there is no wrapper to unpack. Always an
// object, keyed by its root element name.
export type XmlDocument = { [key: string]: XmlNode }
