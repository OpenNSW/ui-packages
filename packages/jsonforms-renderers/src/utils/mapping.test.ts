import { describe, expect, it } from 'vitest'
import { buildFromWrites, resolveWrites } from './mapping'

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

const run = (entries: Parameters<typeof resolveWrites>[1]) => resolveWrites(doc, entries)

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

  it('replaces a scalar with an object when a later write needs to nest under it', () => {
    // Deliberately permissive rather than throwing — a schema author's own
    // ordering mistake, not something this pure function should police.
    expect(
      buildFromWrites([
        { to: 'Party', value: 'flat' },
        { to: 'Party.Name', value: 'Acme' },
      ]),
    ).toEqual({ Party: { Name: 'Acme' } })
  })

  it('returns an empty object for no writes', () => {
    expect(buildFromWrites([])).toEqual({})
  })
})
