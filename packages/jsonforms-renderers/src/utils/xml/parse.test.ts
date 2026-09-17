import { describe, expect, it } from 'vitest'
import { MAX_XML_CHARS, XmlParseError, parseXmlToDocument } from './parse'

// Most of the assertions here are PINNING tests: they encode behavior verified
// against fast-xml-parser 5.11.1 that this package's persisted data shape
// depends on. They exist so a dependency bump that changes a default, or drops
// one of the library's own guards, fails CI instead of silently changing what
// gets written into form data.

describe('parseXmlToDocument', () => {
  describe('value coercion', () => {
    it('keeps a leading-zero identifier as a string instead of coercing it to a number', async () => {
      // The library's own numberParseOptions default (leadingZeros: true) turns
      // "00742" into 742. SKUs, postcodes and invoice refs are full of these,
      // and the corruption is irreversible once persisted, so PARSER_OPTIONS
      // overrides it. This is the single most important coercion assertion here.
      const result = await parseXmlToDocument('<r><sku>00742</sku></r>')
      expect(result).toEqual({ r: { sku: '00742' } })
    })

    it('keeps a hex-looking value as a string instead of coercing it to a number', async () => {
      const result = await parseXmlToDocument('<r><code>0x1A</code></r>')
      expect(result).toEqual({ r: { code: '0x1A' } })
    })

    it('parses plain numbers, booleans and scientific notation', async () => {
      const result = await parseXmlToDocument('<r><qty>10</qty><ok>true</ok><big>1.5e3</big></r>')
      expect(result).toEqual({ r: { qty: 10, ok: true, big: 1500 } })
    })

    it('coerces an attribute and an element holding the same text to the same type', async () => {
      // Asymmetry here (the library's default: parseTagValue true,
      // parseAttributeValue false) would mean <line qty="10"/> yields the
      // STRING "10" while <line><qty>10</qty></line> yields the NUMBER 10 —
      // making a value's type depend on which spelling the source file used.
      const result = await parseXmlToDocument('<r><a q="10"/><b><q>10</q></b></r>')
      expect(result).toEqual({ r: { a: { '@_q': 10 }, b: { q: 10 } } })
    })

    it('decodes entities and merges CDATA into the ordinary text value', async () => {
      const result = await parseXmlToDocument('<r><a><![CDATA[x & y]]></a><b>x &amp; y</b></r>')
      expect(result).toEqual({ r: { a: 'x & y', b: 'x & y' } })
    })

    it('decodes numeric character references, which are core XML', async () => {
      // Requires htmlEntities: true despite the option's name — with the
      // library default these persist as the literal text "&#233;", so any
      // accented character written that way would be silently mangled.
      const result = await parseXmlToDocument('<r><a>caf&#233;</a><b>caf&#x00E9;</b></r>')
      expect(result).toEqual({ r: { a: 'café', b: 'café' } })
    })

    it('discards the XML declaration rather than exposing it as a document key', async () => {
      const result = await parseXmlToDocument('<?xml version="1.0" encoding="UTF-8"?><r><a>1</a></r>')
      expect(result).toEqual({ r: { a: 1 } })
    })
  })

  describe('node shape', () => {
    it('collapses an attribute-less leaf to a bare value but keeps #text on a node with attributes', async () => {
      // The shape of a leaf therefore depends on whether that ONE element
      // happened to carry an attribute, so anything reading these values has to
      // handle both a bare scalar and a '#text' object at the same path.
      const result = await parseXmlToDocument('<r><n>W</n><m lang="en">W</m></r>')
      expect(result).toEqual({ r: { n: 'W', m: { '#text': 'W', '@_lang': 'en' } } })
    })

    it('preserves namespace prefixes by default', async () => {
      const result = await parseXmlToDocument('<r xmlns:m="urn:x"><m:g>1</m:g></r>')
      expect(result).toEqual({ r: { 'm:g': 1, '@_xmlns:m': 'urn:x' } })
    })

    it('strips namespace prefixes and xmlns declarations when removeNamespaces is set', async () => {
      const result = await parseXmlToDocument('<r xmlns:m="urn:x"><m:g>1</m:g></r>', { removeNamespaces: true })
      expect(result).toEqual({ r: { g: 1 } })
    })

    it('keeps a dot-containing element name verbatim, even though no dotted path can address it', async () => {
      // Legal XML (some SAP/EDI converters emit it) and not corruption — the
      // value is in the document. But @jsonforms/core's Resolve.data splits
      // paths on '.' with no escaping, so no dotted path can address such a key
      // (x-computed included). Documented in docs/xml-control.md; pinned here so
      // the behavior isn't a surprise.
      const result = await parseXmlToDocument('<r><Order.Header>1</Order.Header></r>')
      expect(result).toEqual({ r: { 'Order.Header': 1 } })
    })
  })

  describe('arrayPaths', () => {
    const one = '<r><c><i><q>1</q></i></c></r>'
    const two = '<r><c><i><q>1</q></i><i><q>2</q></i></c></r>'

    it('parses a lone repeated element as an object when arrayPaths is not configured', async () => {
      expect(await parseXmlToDocument(one)).toEqual({ r: { c: { i: { q: 1 } } } })
    })

    it('parses two of the same element as an array, so the shape depends on the file', async () => {
      // The footgun itself, asserted deliberately: without arrayPaths the same
      // path is an object for a one-row file and an array for a two-row one.
      expect(await parseXmlToDocument(two)).toEqual({ r: { c: { i: [{ q: 1 }, { q: 2 }] } } })
    })

    it('forces a lone repeated element into a one-element array when its jPath is in arrayPaths', async () => {
      const result = await parseXmlToDocument(one, { arrayPaths: ['r.c.i'] })
      expect(result).toEqual({ r: { c: { i: [{ q: 1 }] } } })
    })

    it('accepts a bare tag name as a match-at-any-depth shorthand', async () => {
      const result = await parseXmlToDocument(one, { arrayPaths: ['i'] })
      expect(result).toEqual({ r: { c: { i: [{ q: 1 }] } } })
    })

    it('leaves a genuinely repeated element an array whether or not it is configured', async () => {
      const result = await parseXmlToDocument(two, { arrayPaths: ['r.c.i'] })
      expect(result).toEqual({ r: { c: { i: [{ q: 1 }, { q: 2 }] } } })
    })
  })

  describe('reserved and unsafe names', () => {
    it.each(['__proto__', 'constructor', 'prototype'])(
      "rejects <%s> without leaking the library's raw [SECURITY] message",
      async (name) => {
        const promise = parseXmlToDocument(`<r><${name}>x</${name}></r>`)
        await expect(promise).rejects.toThrow(XmlParseError)
        // The wording matters as much as the rejection: this string is rendered
        // straight into a form field.
        await expect(promise).rejects.toThrow(/reserved JavaScript name/)
        await expect(promise).rejects.not.toThrow(/\[SECURITY\]/)
      },
    )

    it('renames a dangerous-but-not-critical element to an enumerable own property', async () => {
      // <toString> is where a naive parser corrupts data: on a plain {} node,
      // `obj['toString'] !== undefined` reads as "this tag repeated" and turns
      // the value into an array whose first element is a function. The library
      // renames it instead, so assert the key survives a JSON round trip.
      const result = await parseXmlToDocument('<r><toString>x</toString></r>')
      expect(result).toEqual({ r: { __toString: 'x' } })
      expect(JSON.parse(JSON.stringify(result))).toEqual({ r: { __toString: 'x' } })
    })
  })

  describe('malformed and hostile input', () => {
    it('rejects an unclosed tag with its line and column, which parse() alone would accept', async () => {
      // parser.parse('<r><a>1</a>') returns { r: { a: 1 } } — no throw. Only
      // XMLValidator catches it, which is why parseXmlToDocument validates
      // first. If this test ever fails, silently-truncated documents are being
      // persisted as if they were complete.
      const promise = parseXmlToDocument('<r><a>1</a>')
      await expect(promise).rejects.toThrow(XmlParseError)
      await expect(promise).rejects.toThrow(/Invalid XML at line \d+, column \d+/)
    })

    it('rejects a mismatched closing tag', async () => {
      await expect(parseXmlToDocument('<r><a>1</b></r>')).rejects.toThrow(XmlParseError)
    })

    it('rejects an empty or whitespace-only document', async () => {
      await expect(parseXmlToDocument('')).rejects.toThrow(/empty/)
      await expect(parseXmlToDocument('   \n ')).rejects.toThrow(/empty/)
    })

    it('refuses to resolve an external entity', async () => {
      const promise = parseXmlToDocument('<!DOCTYPE r [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><r>&xxe;</r>')
      await expect(promise).rejects.toThrow(XmlParseError)
      await expect(promise).rejects.toThrow(/External entities are not supported/)
    })

    it('resolves a flat DOCTYPE-declared entity', async () => {
      await expect(parseXmlToDocument('<!DOCTYPE r [<!ENTITY a "hello">]><r>&a;</r>')).resolves.toEqual({
        r: 'hello',
      })
    })

    it('leaves a billion-laughs entity unexpanded rather than amplifying it', async () => {
      // This is why no amplification guard of our own is needed: the library
      // does not recursively expand an entity whose value references another
      // entity — such a reference is left LITERAL. So the classic nested
      // lol0..lol9 payload cannot grow at all, in either declaration order
      // (ascending and descending both verified). Pinned because the day this
      // stops being true, this control needs its own expansion budget.
      const asc = Array.from({ length: 9 }, (_, i) => `<!ENTITY lol${i + 1} "${`&lol${i};`.repeat(10)}">`).join('')
      const result = await parseXmlToDocument(`<!DOCTYPE r [<!ENTITY lol0 "lol">${asc}]><r>&lol9;</r>`)
      expect(result).toEqual({ r: '&lol9;' })
    })

    it('rejects a document declaring more entities than the library allows', async () => {
      const many = Array.from({ length: 1200 }, (_, i) => `<!ENTITY e${i} "v">`).join('')
      const promise = parseXmlToDocument(`<!DOCTYPE r [${many}]><r>&e0;</r>`)
      await expect(promise).rejects.toThrow(XmlParseError)
      await expect(promise).rejects.toThrow(/too many or too large entity definitions/)
    })

    it('rejects a document declaring an oversized entity', async () => {
      const promise = parseXmlToDocument(`<!DOCTYPE r [<!ENTITY big "${'x'.repeat(20_000)}">]><r>&big;</r>`)
      await expect(promise).rejects.toThrow(/too many or too large entity definitions/)
    })

    it('rejects a document nested past the library depth bound instead of overflowing the stack', async () => {
      const deep = `<r>${'<a>'.repeat(150)}x${'</a>'.repeat(150)}</r>`
      const promise = parseXmlToDocument(deep)
      await expect(promise).rejects.toThrow(XmlParseError)
      await expect(promise).rejects.toThrow(/nested too deeply/)
    })

    it('parses a document nested within the depth bound', async () => {
      const ok = `<r>${'<a>'.repeat(50)}x${'</a>'.repeat(50)}</r>`
      await expect(parseXmlToDocument(ok)).resolves.toBeTypeOf('object')
    })

    it('rejects a document larger than MAX_XML_CHARS', async () => {
      const huge = `<r><a>${'x'.repeat(MAX_XML_CHARS)}</a></r>`
      await expect(parseXmlToDocument(huge)).rejects.toThrow(/too large to parse/)
    })
  })

  describe('encoding', () => {
    it('strips a UTF-8 BOM so it does not end up in the root element name', async () => {
      const result = await parseXmlToDocument('﻿<invoice><a>1</a></invoice>')
      expect(Object.keys(result)).toEqual(['invoice'])
    })

    it('rejects a document declaring a non-UTF-8 encoding rather than producing mojibake', async () => {
      // File.text() always decodes as UTF-8, so such a document would otherwise
      // parse "successfully" into valid-looking but wrong text.
      const promise = parseXmlToDocument('<?xml version="1.0" encoding="windows-1252"?><r><a>1</a></r>')
      await expect(promise).rejects.toThrow(/unsupported encoding "windows-1252"/)
    })

    it('accepts UTF-8 spelled either way', async () => {
      await expect(parseXmlToDocument('<?xml version="1.0" encoding="utf8"?><r><a>1</a></r>')).resolves.toEqual({
        r: { a: 1 },
      })
      await expect(parseXmlToDocument('<?xml version="1.0" encoding="UTF-8"?><r><a>1</a></r>')).resolves.toEqual({
        r: { a: 1 },
      })
    })

    it('ignores an encoding pseudo-attribute on a processing instruction', async () => {
      // <?xml-stylesheet?> is a PI, not the declaration, and says nothing about
      // how the bytes are encoded. An unanchored scan for /<\?xml.*encoding=/
      // matches it anyway and rejects a perfectly valid UTF-8 document.
      await expect(
        parseXmlToDocument(
          '<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet encoding="windows-1252"?><r><a>1</a></r>',
        ),
      ).resolves.toEqual({ r: { a: 1 } })
      // Same PI with no declaration at all in front of it.
      await expect(parseXmlToDocument('<?xml-stylesheet encoding="windows-1252"?><r><a>1</a></r>')).resolves.toEqual({
        r: { a: 1 },
      })
    })

    it('leaves a misplaced declaration to the validator, which explains it better', async () => {
      // Anchoring the encoding scan means a declaration preceded by whitespace
      // is not treated as one. That is not a hole: it isn't a declaration per
      // the spec, and the validator rejects it by name.
      await expect(
        parseXmlToDocument('\n  <?xml version="1.0" encoding="windows-1252"?><r><a>1</a></r>'),
      ).rejects.toThrow(/XML declaration allowed only at the start/)
    })
  })
})
