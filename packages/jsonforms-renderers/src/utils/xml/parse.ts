import type { MatcherView, X2jOptions } from 'fast-xml-parser'
import type { XmlDocument } from './types'

// Thin integration layer over `fast-xml-parser` (validation + parsing), turning
// an XML string into a plain, JSON-serializable object. See docs/xml-control.md
// for the resulting shape, the coercion rules and the documented limits.

// Thrown for every rejection this module makes. Every message is already
// phrased for an end user (see describeParserFailure), so a caller can render
// `err.message` directly.
export class XmlParseError extends Error {}

// Bounds the in-memory object graph, which is far larger than the source text.
// Complements x-xml.maxSize: that checks bytes before the file is read, this
// checks characters after decoding.
export const MAX_XML_CHARS = 5_000_000

// Only the XML prolog is scanned for an encoding declaration — it must precede
// the root element, so a bounded prefix is always sufficient.
const PROLOG_SCAN_CHARS = 1024
const ENCODING_DECLARATION = /<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/i

// Every option affecting the parsed shape is set explicitly, including those
// matching the library's current default: this object is the persisted-shape
// contract, so a default changing under a dependency bump shows up as a diff
// here rather than as a silent change in production data. Comments below cover
// only the values chosen against the library's default, or against a hazard.
const PARSER_OPTIONS: X2jOptions = {
  // Default is true, which would silently drop what in many formats is most of
  // the payload.
  ignoreAttributes: false,
  // Non-empty, so `@_id` and a sibling <id> element can coexist on one node.
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: true,
  // Default is false, which would make <line qty="10"/> a string while
  // <line><qty>10</qty></line> is a number.
  parseAttributeValue: true,
  // Defaults are hex: true, leadingZeros: true, which turn "00742" into 742 and
  // "0x1A" into 26 — silent, irreversible corruption of the zero-padded SKUs,
  // postcodes and invoice refs that fill real XML.
  numberParseOptions: { hex: false, leadingZeros: false, eNotation: true },
  trimValues: true,
  // CDATA merges into the node's ordinary text value: whether an author wrapped
  // a value in CDATA is an encoding detail, not content.
  cdataPropName: false,
  commentPropName: false,
  // Enabled so `&amp;` and DOCTYPE-declared entities resolve. Verified against
  // 5.11.1 and pinned in parse.test.ts: the library refuses external and
  // parameter entities, caps declarations, and leaves a nested entity reference
  // literal rather than expanding it — so no XXE or amplification guard of our
  // own is needed.
  processEntities: true,
  // Default is false. Despite the name, this is what decodes NUMERIC character
  // references (`&#233;`), which are core XML — left off they persist as
  // literal text. The HTML named set comes along as a harmless superset.
  htmlEntities: true,
  // Defaults are both false, which injects a `?xml` key of transport metadata
  // into the document root.
  ignoreDeclaration: true,
  ignorePiTags: true,
  // A leaf with no attributes collapses to its bare value, so <qty>10</qty> is
  // `10`. Only genuinely mixed nodes get a '#text' key.
  alwaysCreateTextNode: false,
  preserveOrder: false,
  // Prefixes are kept so <a:Name> and <b:Name> stay distinguishable;
  // x-xml.removeNamespaces opts out per field, lossily — see docs.
  removeNSPrefix: false,
  // Library defaults, restated because they are load-bearing: the depth bound
  // is what stops a deeply-nested document overflowing the stack here and in
  // every recursive consumer downstream.
  maxNestedTags: 100,
  strictReservedNames: true,
}

// The central XML footgun: <contacts><contact/></contacts> parses to an OBJECT
// at `invoice.contacts.contact`, while a second <contact/> makes the same path
// an ARRAY — so the persisted shape would depend on how many rows the uploaded
// file happened to contain. arrayPaths forces the array shape, moving that
// decision to the schema author.
//
// Matching is against the library's jPath: dotted, no array indices, and it
// INCLUDES the root element. A bare tag name matches that element at any depth.
function makeIsArray(arrayPaths: string[]): (tagName: string, jPath: string | MatcherView) => boolean {
  const configured = new Set(arrayPaths)
  if (configured.size === 0) return () => false
  return (tagName, jPath) =>
    // A string while the library's own `jPath` option is true (the default) and
    // a matcher object otherwise; both stringify to the same dotted path.
    configured.has(typeof jPath === 'string' ? jPath : jPath.toString()) || configured.has(tagName)
}

// The library throws plain Errors from several internal guards. Each is a
// legitimate rejection, but none is phrased for an end user — and one leads
// with "[SECURITY]", which must never reach a form field. The dependency is
// pinned ^5.11.1 because these guards are recent, and parse.test.ts covers each
// one so a bump that drops one fails CI.
function describeParserFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : ''
  if (message.startsWith('[SECURITY] Invalid name:')) {
    // A tag or attribute named __proto__, constructor or prototype. Nodes are
    // plain `{}`, so such a key would mutate the prototype rather than become
    // an own property, dropping that element from JSON.stringify entirely.
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

// XML text in, plain object out. Throws XmlParseError, whose message is always
// safe to render, for every rejection.
//
// The library is imported dynamically so it splits into an on-demand chunk: an
// app whose forms contain no XML field never pays to download it. Unlike
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
