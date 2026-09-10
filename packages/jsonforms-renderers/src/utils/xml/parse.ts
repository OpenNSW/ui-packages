import type { MatcherView, X2jOptions } from 'fast-xml-parser'
import type { XmlDocument } from './types'

// Thin integration layer over `fast-xml-parser` (validation + parsing), turning
// an XML string into a plain, JSON-serializable object. See
// docs/xml-control.md for the resulting shape, the value-coercion rules and
// the documented limits.
//
// This file owns three things the library does not give us for free:
// translating however it reports a failure into wording safe to show in a form
// field; pinning every option that affects the persisted shape; and the
// `arrayPaths` mechanism that stops a document's shape depending on how many
// rows the uploaded file happened to have.

// Thrown for every rejection this module makes — a malformed document, an
// unsupported encoding, a size/nesting limit, or one of the library's own
// internal guards. Mirrors utils/spreadsheet/parse.ts's SheetParseError, except
// that here EVERY message is already user-facing (see describeParserFailure),
// so a caller can render `err.message` directly instead of choosing between it
// and a generic fallback.
export class XmlParseError extends Error {}

// Bounds the in-memory object graph, which is far larger than the source text
// (every element becomes an object with a string key). Paired with, not
// replaced by, x-xml.maxSize: a caller checks bytes before reading the file,
// this checks characters after decoding it.
export const MAX_XML_CHARS = 5_000_000

// Only the XML prolog is scanned for an encoding declaration — it must precede
// the root element, so a bounded prefix is always sufficient.
const PROLOG_SCAN_CHARS = 1024
const ENCODING_DECLARATION = /<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/i

// Every option that affects the parsed shape is spelled out below, INCLUDING
// the ones that happen to match the library's current default. This object is
// the persisted-shape contract for every document this control ever writes, so
// a default changing under a dependency bump has to show up as a diff here
// rather than as a silent change in production data. Typed as X2jOptions so a
// misspelled option name is a compile error instead of a silently ignored key.
const PARSER_OPTIONS: X2jOptions = {
  // NOT the library default (true). Attributes are real data — <price
  // currency="AUD">, <line id="3"> — and dropping them silently would lose
  // most of the payload in formats that lean on them.
  ignoreAttributes: false,
  // Non-empty prefix, deliberately: it namespaces attributes away from element
  // names, so `@_id` and a sibling <id> element can coexist on one node
  // without either clobbering the other.
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: true,
  // NOT the library default (false). Symmetry: <line qty="10"/> and
  // <line><qty>10</qty></line> must yield the same JS type, or a consumer has
  // to remember which spelling the source file used before comparing values.
  parseAttributeValue: true,
  // NOT the library defaults (hex: true, leadingZeros: true). Leading-zero
  // identifiers — SKUs, postcodes, invoice and account refs — are everywhere in
  // real XML, and "00742" -> 742 is silent, irreversible data corruption that
  // only surfaces far downstream. eNotation stays on: "1.5e3" in a numeric
  // field really does mean 1500.
  numberParseOptions: { hex: false, leadingZeros: false, eNotation: true },
  trimValues: true,
  // false = CDATA merges into the node's ordinary text value. Someone asking
  // "what is the description?" shouldn't have to care that the author happened
  // to wrap it in CDATA; a separate key would leak an encoding detail into the
  // persisted shape.
  cdataPropName: false,
  commentPropName: false,
  // Left enabled so `&amp;` and DOCTYPE-declared entities resolve. Safe by
  // default in v5, verified against 5.11.1 and pinned in parse.test.ts: the
  // library refuses external and parameter entities outright, caps declarations
  // (maxEntityCount 1000, maxEntitySize 10_000), and — the part that actually
  // makes billion-laughs impossible rather than merely bounded — does not
  // expand an entity whose own value references another entity, leaving it
  // literal instead. So no XXE or amplification guard of our own is needed.
  processEntities: true,
  // NOT the library default (false). Despite the option's name, this is what
  // decodes NUMERIC character references — `&#233;`, `&#x00E9;` — which are
  // core XML, not an HTML extension: left off, an accented character written
  // that way persists as the literal text "&#233;". Decoding the HTML named
  // set (`&nbsp;` and friends) comes along with it, which is a harmless
  // superset — those appear in plenty of real-world XML and resolve to
  // ordinary characters.
  htmlEntities: true,
  // NOT the library defaults (both false). With ignoreAttributes off, leaving
  // these on injects a `?xml: { '@_version': '1.0', ... }` key into the
  // document root — transport metadata masquerading as content, which would
  // then show up in the preview and in every path a schema author reads.
  ignoreDeclaration: true,
  ignorePiTags: true,
  // false = a leaf with no attributes collapses to its bare value, so
  // <qty>10</qty> is `10`, not `{ '#text': 10 }`. Only genuinely mixed nodes
  // get a '#text' key. Keeps the common case addressable without a suffix.
  alwaysCreateTextNode: false,
  // true would restructure the output into an array of single-key objects,
  // which no dotted path could address.
  preserveOrder: false,
  // Namespace prefixes are preserved by default so <a:Name> and <b:Name> stay
  // distinguishable; x-xml.removeNamespaces opts out per field. See
  // docs/xml-control.md for why stripping is lossy.
  removeNSPrefix: false,
  // Library defaults, restated: a nesting-depth bound (which is what stops a
  // deeply-nested document overflowing the stack, in the library and in every
  // recursive consumer downstream), and a hard reject for a tag named after a
  // reserved output key.
  maxNestedTags: 100,
  strictReservedNames: true,
}

// THE central XML footgun: <contacts><contact/></contacts> parses to an OBJECT
// at `invoice.contacts.contact`, while a second <contact/> makes the same path
// an ARRAY. Left alone, the shape of the persisted data would depend on how
// many rows the uploader's file happened to contain, so anything written
// against one file breaks on the next. arrayPaths forces the array shape
// unconditionally, moving that decision to the schema author.
//
// The library's jPath is a dotted path with no array indices, and it INCLUDES
// the root element ("invoice.contacts.contact"), so an entry stays stable
// however many siblings exist. A bare tag name is accepted as a shorthand
// matching that element at any depth.
function makeIsArray(arrayPaths: string[]): (tagName: string, jPath: string | MatcherView) => boolean {
  const configured = new Set(arrayPaths)
  if (configured.size === 0) return () => false
  return (tagName, jPath) =>
    // The library hands over a string while its own `jPath` option is true (the
    // default) and a live matcher object otherwise; both stringify to the same
    // dotted path, so normalize rather than depend on that default staying put.
    configured.has(typeof jPath === 'string' ? jPath : jPath.toString()) || configured.has(tagName)
}

// The library throws plain Errors from several internal guards. Each is a
// legitimate rejection, but none is phrased for an end user — and one of them
// leads with "[SECURITY]", which must never surface in a form field. Verified
// against fast-xml-parser 5.11.1 (src/xmlparser/OrderedObjParser.js's
// sanitizeName, src/util.js's criticalProperties, src/xmlparser/DocTypeReader.js);
// the dependency is pinned ^5.11.1 rather than ^5 because these guards are
// recent, and parse.test.ts pins each one so a bump that drops one fails CI
// instead of silently regressing.
function describeParserFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : ''
  if (message.startsWith('[SECURITY] Invalid name:')) {
    // A tag or attribute named __proto__, constructor or prototype. The
    // library builds every node as a plain `{}`, so assigning such a key would
    // hit an inherited setter and mutate the node's prototype instead of
    // creating an enumerable own property — silently dropping that element from
    // Object.keys/entries and from JSON.stringify. It rejects outright; we only
    // have to say so readably.
    return 'This document uses a reserved JavaScript name (__proto__, constructor or prototype) as an element or attribute name, which cannot be represented safely.'
  }
  if (message === 'External entities are not supported' || message === 'Parameter entities are not supported') {
    return `${message}. Please remove the DOCTYPE entity declarations and try again.`
  }
  if (message.startsWith('Maximum nested tags exceeded')) {
    return 'This document is nested too deeply to parse.'
  }
  if (message.startsWith('Entity count') || message.includes('exceeds maximum allowed')) {
    return 'This document declares too many or too large entity definitions to expand safely.'
  }
  return "This doesn't look like a valid XML document. Please check the file and try again."
}

export interface ParseXmlOptions {
  /** Element paths that must always parse as an array. See makeIsArray. */
  arrayPaths?: string[]
  /** Strip namespace prefixes from element and attribute names. */
  removeNamespaces?: boolean
}

// The public entry point: XML text in, plain object out. Throws XmlParseError,
// whose message is always safe to render, for every rejection.
//
// The libraries are imported dynamically (not as a static top-level import) so
// the XML code splits into an on-demand chunk, matching the rationale in
// utils/spreadsheet/expression.ts: a consuming app whose forms never contain an
// x-xml field should never pay to download the parser. Unlike
// fast-formula-parser, this package ships a real dual exports map with named
// ESM exports, so no `.default ?? module` interop branch and no hand-written
// ambient .d.ts are needed.
export async function parseXmlToDocument(xml: string, options: ParseXmlOptions = {}): Promise<XmlDocument> {
  if (typeof xml !== 'string') throw new XmlParseError('This file could not be read as text.')

  // A UTF-8 BOM survives File.text(). The library's validator strips it but its
  // parser does not, so removing it once here keeps both stages reading the
  // same input — otherwise the root key comes back with a leading U+FEFF.
  const text = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml

  if (text.trim() === '') throw new XmlParseError('This file is empty.')
  if (text.length > MAX_XML_CHARS) {
    throw new XmlParseError(
      `This document is too large to parse (over ${MAX_XML_CHARS / 1_000_000} million characters).`,
    )
  }

  // File.text() always decodes as UTF-8, so a document declaring anything else
  // would parse "successfully" into mojibake — valid-looking data that is
  // quietly wrong. Rejecting is the honest option; transcoding is deliberately
  // out of scope (see docs/xml-control.md).
  const declaredEncoding = ENCODING_DECLARATION.exec(text.slice(0, PROLOG_SCAN_CHARS))?.[1]
  if (declaredEncoding && !/^utf-?8$/i.test(declaredEncoding)) {
    throw new XmlParseError(
      `This document declares the unsupported encoding "${declaredEncoding}". Only UTF-8 is supported.`,
    )
  }

  const { XMLParser, XMLValidator } = await import('fast-xml-parser')

  // XMLParser.parse() is LENIENT: given "<r><a>1</a>" (root never closed) it
  // returns { r: { a: 1 } } rather than throwing, so a truncated or mismatched
  // document would persist as silently incomplete data. Validating first is the
  // only thing that catches it. allowBooleanAttributes must stay in lockstep
  // with PARSER_OPTIONS or the two stages disagree about what "valid" means.
  const validation = XMLValidator.validate(text, { allowBooleanAttributes: false })
  if (validation !== true) {
    const { msg, line, col } = validation.err
    throw new XmlParseError(`Invalid XML at line ${line}, column ${col}: ${msg}`)
  }

  const parser = new XMLParser({
    ...PARSER_OPTIONS,
    removeNSPrefix: options.removeNamespaces === true,
    isArray: makeIsArray(options.arrayPaths ?? []),
  })

  // parse() is declared `any`. Landing it in an explicitly `unknown` binding is
  // the whole narrowing story — no-unsafe-assignment permits any -> unknown —
  // so the checks below are what actually establish the type, and no
  // eslint-disable is needed anywhere in this file.
  let parsed: unknown
  try {
    parsed = parser.parse(text)
  } catch (err) {
    throw new XmlParseError(describeParserFailure(err))
  }

  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new XmlParseError('This document has no root element.')
  }
  return parsed as XmlDocument
}
