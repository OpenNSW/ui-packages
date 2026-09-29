import { describe, expect, it } from 'vitest'
import { buildFromWrites, resolveWrites, validateWriteToEntry } from './mapping'

// A document shaped like the ones importers actually meet: values nested at
// different depths, a date in a local format, an enum as a number, an
// identifier split across elements, and two different spellings of "empty".
const doc = {
  order: {
    customer: { code: 'CUST-0042', account_number: 9940013877000, notes: { null: '' } },
    reference: { office: 'CBEX1', serial: 'E', number: 44695, year: 2026 },
    header: { order_date: '7/23/26', priority: 1, discount: { null: '' }, cancelled: 'false' },
    memo: '',
    line: [
      { sku: 'A-1', qty: 10 },
      { sku: 'B-2', qty: 20 },
    ],
  },
}

const run = (entries: Parameters<typeof resolveWrites>[1]) => resolveWrites(doc, entries, 'import')

// Form data, shaped the way an exporter reads it.
const form = {
  invoice_no: 'INV-7',
  note: 'Rush & partial',
  lang: 'en',
  rush: true,
  issued_on: '2026-07-23',
  when: new Date(2026, 6, 23),
  lines: [
    { sku: 'A-1', qty: 10, line_no: 1 },
    { sku: 'B-2', qty: 20, line_no: 2 },
  ],
}

const exportRun = (entries: Parameters<typeof resolveWrites>[1]) => resolveWrites(form, entries, 'export')

describe('resolveWrites', () => {
  it('copies a value across unchanged when nothing else is asked for', async () => {
    expect(await run([{ from: 'order.customer.code', to: 'code' }])).toEqual([{ to: 'code', value: 'CUST-0042' }])
  })

  it('writes a repeated element whole, which is how a table gets filled', async () => {
    // The main thing an importer does. An array is an object, so the
    // empty-object rule has to make an exception for it or this writes nothing.
    expect(await run([{ from: 'order.line', to: 'orders.0.lines.sheet' }])).toEqual([
      {
        to: 'orders.0.lines.sheet',
        value: [
          { sku: 'A-1', qty: 10 },
          { sku: 'B-2', qty: 20 },
        ],
      },
    ])
  })

  it('leaves rows alone when map or as is also set, rather than stringifying them', async () => {
    const [write] = await run([{ from: 'order.line', to: 'rows', as: 'string' }])
    expect(Array.isArray(write.value)).toBe(true)
  })

  describe('nested writeTo', () => {
    it('reshapes each repetition into the destination shape, instead of passing the source rows through', async () => {
      expect(
        await run([
          {
            from: 'order.line',
            to: 'lineItems',
            writeTo: [
              { from: 'sku', to: 'product.sku' },
              { from: 'qty', to: 'quantity', as: 'number' },
            ],
          },
        ]),
      ).toEqual([
        {
          to: 'lineItems',
          value: [
            { product: { sku: 'A-1' }, quantity: 10 },
            { product: { sku: 'B-2' }, quantity: 20 },
          ],
        },
      ])
    })

    it('still writes rows through whole when no nested writeTo is given', async () => {
      expect(await run([{ from: 'order.line', to: 'orders.0.lines.sheet' }])).toEqual([
        {
          to: 'orders.0.lines.sheet',
          value: [
            { sku: 'A-1', qty: 10 },
            { sku: 'B-2', qty: 20 },
          ],
        },
      ])
    })

    it('propagates a bad nested entry the same way a top-level one would', async () => {
      await expect(run([{ from: 'order.line', to: 'lineItems', writeTo: [{ to: 'sku' }] }])).rejects.toThrow(
        /writeTo "sku" needs either "from" or "formula"/,
      )
    })

    it('reports itself loudly rather than silently passing a non-array from through', async () => {
      // A likely `from`/`arrayPaths` typo, not a value shaped for reshaping —
      // a mistake worth surfacing rather than a scalar written unreshaped.
      await expect(
        run([{ from: 'order.customer.code', to: 'lineItems', writeTo: [{ from: 'sku', to: 'sku' }] }]),
      ).rejects.toThrow(/writeTo "lineItems": "writeTo" is set, but "from" did not resolve to a repeating element/)
    })
  })

  describe('as', () => {
    it('stringifies a number, so a long identifier keeps its digits', async () => {
      expect(await run([{ from: 'order.customer.account_number', to: 'ref', as: 'string' }])).toEqual([
        { to: 'ref', value: '9940013877000' },
      ])
    })

    it('reformats a date from the format the document uses', async () => {
      expect(await run([{ from: 'order.header.order_date', to: 'on', as: 'date', format: 'M/D/YY' }])).toEqual([
        { to: 'on', value: '2026-07-23' },
      ])
    })

    it('treats a date that does not match the declared format as absent, never a guess', async () => {
      expect(await run([{ from: 'order.customer.code', to: 'on', as: 'date', format: 'M/D/YY' }])).toEqual([])
    })

    it('reads a boolean from the spellings a document actually uses', async () => {
      expect(await run([{ from: 'order.header.cancelled', to: 'off', as: 'boolean' }])).toEqual([
        { to: 'off', value: false },
      ])
    })

    it('treats an uncoercible number as absent rather than writing NaN', async () => {
      expect(await run([{ from: 'order.customer.code', to: 'n', as: 'number' }])).toEqual([])
    })
  })

  describe('map', () => {
    it('substitutes a coded value', async () => {
      expect(await run([{ from: 'order.header.priority', to: 'p', map: { '1': 'high', '0': 'normal' } }])).toEqual([
        { to: 'p', value: 'high' },
      ])
    })

    it('passes an unmapped value through rather than silently dropping it', async () => {
      // Writing the original lets AJV reject an unexpected code loudly. Quietly
      // falling back would hide that the document said something unforeseen.
      expect(await run([{ from: 'order.header.priority', to: 'p', map: { '9': 'urgent' } }])).toEqual([
        { to: 'p', value: 1 },
      ])
    })
  })

  describe('absent sources', () => {
    it('treats a <null/> wrapper as empty, because that is what it means', async () => {
      // It parses to an OBJECT, { null: '' }. Passing it through would put an
      // object into a number field.
      expect(await run([{ from: 'order.header.discount', to: 'd', as: 'number', default: 0 }])).toEqual([
        { to: 'd', value: 0 },
      ])
    })

    it('treats an empty element as empty too', async () => {
      expect(await run([{ from: 'order.memo', to: 'm', default: '' }])).toEqual([{ to: 'm', value: '' }])
    })

    it('writes nothing at all when the source is absent and no default is given', async () => {
      // An importer fills in what its document carries; clearing a field the
      // document is silent about is a different action.
      expect(await run([{ from: 'order.nope', to: 'x' }])).toEqual([])
    })
  })

  describe('formula', () => {
    it('composes one value out of several elements', async () => {
      expect(
        await run([
          {
            to: 'reference_no',
            inputs: {
              ref_office: 'order.reference.office',
              ref_serial: 'order.reference.serial',
              ref_number: 'order.reference.number',
              ref_year: 'order.reference.year',
            },
            formula: 'CONCATENATE(ref_office,"/",ref_serial,"/",ref_number,"/",ref_year)',
          },
        ]),
      ).toEqual([{ to: 'reference_no', value: 'CBEX1/E/44695/2026' }])
    })

    it('falls back rather than composing a value with a hole in it', async () => {
      expect(
        await run([
          {
            to: 'reference_no',
            inputs: { ref_office: 'order.reference.office', ref_missing: 'order.reference.nope' },
            formula: 'CONCATENATE(ref_office,ref_missing)',
            default: 'UNKNOWN',
          },
        ]),
      ).toEqual([{ to: 'reference_no', value: 'UNKNOWN' }])
    })

    it('rejects a 1-3 letter alphabetic alias, which the grammar reads as a column', async () => {
      // `off` lexes as a spreadsheet column reference, not a variable, so the
      // expression silently means something else. Better to fail loudly.
      await expect(
        run([{ to: 'x', inputs: { off: 'order.reference.office' }, formula: 'CONCATENATE(off,"!")' }]),
      ).rejects.toThrow(/writeTo "x"/)
    })

    it('names the target when an expression cannot be evaluated', async () => {
      await expect(
        run([{ to: 'x', inputs: { ref_year: 'order.reference.year' }, formula: 'NOPE(ref_year)' }]),
      ).rejects.toThrow(/writeTo "x"/)
    })
  })

  it('requires a source', async () => {
    await expect(run([{ to: 'x' }])).rejects.toThrow(/needs either "from" or "formula"/)
  })

  it('rejects an empty "to", which on import would replace the whole form', async () => {
    await expect(run([{ from: 'order.customer.code', to: '' }])).rejects.toThrow(/"to" must be a non-empty path/)
    await expect(exportRun([{ from: 'invoice_no', to: '.' }])).rejects.toThrow(/"to" must be a non-empty path/)
  })
})

describe('resolveWrites on export: attributes and #text', () => {
  it('writes an attribute of the root element from a top-level @_ segment', async () => {
    expect(await exportRun([{ from: 'invoice_no', to: '@_id' }])).toEqual([{ to: '@_id', value: 'INV-7' }])
  })

  it('writes text and an attribute onto the same element', async () => {
    expect(
      buildFromWrites(
        await exportRun([
          { from: 'note', to: 'Note.#text' },
          { from: 'lang', to: 'Note.@_lang' },
        ]),
      ),
    ).toEqual({ Note: { '#text': 'Rush & partial', '@_lang': 'en' } })
  })

  it('puts an attribute on each repeated element through a nested writeTo', async () => {
    const [write] = await exportRun([
      {
        from: 'lines',
        to: 'Lines.Line',
        writeTo: [
          { from: 'line_no', to: '@_n' },
          { from: 'sku', to: 'SKU' },
        ],
      },
    ])
    expect(write.value).toEqual([
      { '@_n': 1, SKU: 'A-1' },
      { '@_n': 2, SKU: 'B-2' },
    ])
  })

  it('leaves a null attribute or #text off, rather than rendering it as an element', async () => {
    expect(
      await exportRun([
        { from: 'nope', to: '@_id', default: null },
        { from: 'nope', to: 'Note.#text', default: null },
      ]),
    ).toEqual([])
  })

  it('still writes a null element, which renders as an empty one', async () => {
    expect(await exportRun([{ from: 'nope', to: 'Remarks', default: null }])).toEqual([{ to: 'Remarks', value: null }])
  })

  it('rejects rows or an object as an attribute value', async () => {
    await expect(exportRun([{ from: 'lines', to: '@_lines' }])).rejects.toThrow(
      /writeTo "@_lines": an attribute or #text value must be text, a number or a boolean/,
    )
    await expect(exportRun([{ from: 'nope', to: '@_id', default: { null: null } }])).rejects.toThrow(
      /an attribute or #text value must be/,
    )
  })

  it('rejects a Date as an attribute value and points at as: date', async () => {
    await expect(exportRun([{ from: 'when', to: '@_on' }])).rejects.toThrow(/Add "as": "date" to write a date/)
  })

  it('writes a boolean attribute as a value, not as a bare flag', async () => {
    expect(await exportRun([{ from: 'rush', to: '@_rush' }])).toEqual([{ to: '@_rush', value: true }])
  })
})

describe('validateWriteToEntry', () => {
  it('rejects an attribute or #text segment that is not last, on export only', () => {
    expect(validateWriteToEntry({ from: 'a', to: 'Party.@_id.x' }, 'export')).toMatch(/"@_id" must be the last segment/)
    expect(validateWriteToEntry({ from: 'a', to: 'Note.#text.x' }, 'export')).toMatch(/"#text" must be the last/)
    expect(validateWriteToEntry({ from: 'a', to: 'Party.@_id.x' }, 'import')).toBeNull()
  })

  it('rejects a bare @_ with no attribute name', () => {
    expect(validateWriteToEntry({ from: 'a', to: 'Party.@_' }, 'export')).toMatch(/needs an attribute name/)
  })

  it('accepts ordinary paths either way', () => {
    expect(validateWriteToEntry({ from: 'a', to: 'Party.Name' }, 'export')).toBeNull()
    expect(validateWriteToEntry({ from: 'a', to: 'Party.@_id' }, 'export')).toBeNull()
    expect(validateWriteToEntry({ from: 'a', to: 'orders.0.id' }, 'import')).toBeNull()
  })

  it('names the entry when resolveWrites meets a bad one', async () => {
    await expect(exportRun([{ from: 'invoice_no', to: 'Party.@_id.x' }])).rejects.toThrow(
      /writeTo "Party.@_id.x": "@_id" must be the last segment/,
    )
  })
})

describe('buildFromWrites', () => {
  it('nests dot-joined segments into an object', () => {
    expect(buildFromWrites([{ to: 'Party.Name', value: 'Acme' }])).toEqual({ Party: { Name: 'Acme' } })
  })

  it('groups sibling writes under a shared parent', () => {
    expect(
      buildFromWrites([
        { to: 'Party.Name', value: 'Acme' },
        { to: 'Party.Code', value: 'A-1' },
        { to: 'Amount', value: 120 },
      ]),
    ).toEqual({ Party: { Name: 'Acme', Code: 'A-1' }, Amount: 120 })
  })

  it('writes a top-level key with no dots as-is', () => {
    expect(buildFromWrites([{ to: 'Amount', value: 120 }])).toEqual({ Amount: 120 })
  })

  it('carries an array value through unchanged, for XMLBuilder to repeat', () => {
    expect(buildFromWrites([{ to: 'Lines', value: [{ sku: 'A-1' }, { sku: 'B-2' }] }])).toEqual({
      Lines: [{ sku: 'A-1' }, { sku: 'B-2' }],
    })
  })

  it('lets a later write win on a colliding leaf', () => {
    expect(
      buildFromWrites([
        { to: 'Amount', value: 100 },
        { to: 'Amount', value: 120 },
      ]),
    ).toEqual({ Amount: 120 })
  })

  it('throws rather than dropping a value that a later write needs to nest under', () => {
    expect(() =>
      buildFromWrites([
        { to: 'Party', value: 'flat' },
        { to: 'Party.Name', value: 'Acme' },
      ]),
    ).toThrow(/writeTo "Party.Name": "Party" is written both as a value and as the parent of other values/)
  })

  it('throws when a value lands on a path other writes already nest under', () => {
    expect(() =>
      buildFromWrites([
        { to: 'Party.Name', value: 'Acme' },
        { to: 'Party', value: 'flat' },
      ]),
    ).toThrow(/"Party" is written both as a value and as the parent/)
  })

  it('points at #text when the collision is between text and an attribute', () => {
    expect(() =>
      buildFromWrites([
        { to: 'Party', value: 'Acme' },
        { to: 'Party.@_id', value: 'P-1' },
      ]),
    ).toThrow(/write its text to "Party.#text"/)
    expect(() =>
      buildFromWrites([
        { to: 'Party.@_id', value: 'P-1' },
        { to: 'Party', value: 'Acme' },
      ]),
    ).toThrow(/write its text to "Party.#text"/)
  })

  it('does not nest under rows', () => {
    expect(() =>
      buildFromWrites([
        { to: 'Lines', value: [{ sku: 'A-1' }] },
        { to: 'Lines.Count', value: 1 },
      ]),
    ).toThrow(/"Lines" is written both as a value/)
  })

  it('never reaches into an object that came in as a value, like a default', () => {
    // `default: { null: null }` is the schema's own object. Writing under it
    // would change the config for every later click.
    const fromSchema = { null: null }
    expect(() =>
      buildFromWrites([
        { to: 'Remarks', value: fromSchema },
        { to: 'Remarks.@_lang', value: 'en' },
      ]),
    ).toThrow(/"Remarks" is written both as a value/)
    expect(fromSchema).toEqual({ null: null })
  })

  it('returns an empty object for no writes', () => {
    expect(buildFromWrites([])).toEqual({})
  })
})
