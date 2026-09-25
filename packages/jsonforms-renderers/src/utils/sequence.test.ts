import { describe, expect, it } from 'vitest'
import type { JsonSchema } from '@jsonforms/core'
import { stampSequences } from './sequence'
import type { SequenceCounters } from './sequence'

const spec = { template: '{orderNo}-{orderDate}-{seq}', padding: 2 }

const itemsSchema = {
  type: 'object',
  properties: {
    lineRef: { type: 'string', readOnly: true, 'x-template': spec },
    note: { type: 'string' },
  },
} as unknown as JsonSchema

// The array sits at `order.lineItems`, so its rows are numbered against
// `order` — the object the template's placeholders live in.
const rootData = { order: { orderNo: 'ORD-77', orderDate: '2026-05-04' } }

const stamp = (newRow: unknown, rows: unknown[], counters: SequenceCounters = {}) =>
  stampSequences(itemsSchema, newRow, rows, rootData, 'order', counters)

/** Adds `count` rows to `rows`, sharing one counter, and returns them. */
const addRows = (count: number, counters: SequenceCounters = {}, rows: unknown[] = []) => {
  for (let i = 0; i < count; i++) rows.push(stamp({}, rows, counters))
  return rows
}

describe('stampSequences', () => {
  it('numbers each new row in turn', () => {
    expect(addRows(3)).toEqual([
      { lineRef: 'ORD-77-2026-05-04-01' },
      { lineRef: 'ORD-77-2026-05-04-02' },
      { lineRef: 'ORD-77-2026-05-04-03' },
    ])
  })

  it('pads to the configured width without truncating a wider number', () => {
    const counters: SequenceCounters = { lineRef: 99 }
    expect(stamp({}, [], counters)).toEqual({ lineRef: 'ORD-77-2026-05-04-100' })
  })

  // The reason the count is held by the caller rather than derived: a row
  // deleted after being numbered must not hand its number to the next one.
  it('does not reuse the number of a deleted row', () => {
    const counters: SequenceCounters = {}
    let rows = addRows(3, counters)

    rows = rows.slice(0, 2) // the third row is removed
    rows.push(stamp({}, rows, counters))

    expect(rows[2]).toEqual({ lineRef: 'ORD-77-2026-05-04-04' })
  })

  it('carries on from the rows an array was reopened with', () => {
    expect(stamp({}, [{ lineRef: 'ORD-77-2026-05-04-07' }])).toEqual({
      lineRef: 'ORD-77-2026-05-04-08',
    })
  })

  // Rows can arrive from outside the control after it has already numbered
  // some of its own: loaded data, an undo, a paste. Reading only the counter
  // there would hand out a number one of those rows already carries.
  it('reconciles a live counter against rows that arrived from elsewhere', () => {
    const counters: SequenceCounters = {}
    const rows = addRows(3, counters)
    expect(counters.lineRef).toBe(3)

    rows.push({ lineRef: 'ORD-77-2026-05-04-07' }) // not numbered by this control
    expect(stamp({}, rows, counters)).toEqual({ lineRef: 'ORD-77-2026-05-04-08' })
  })

  it('does not go backwards when the rows present are behind the counter', () => {
    const counters: SequenceCounters = { lineRef: 5 }
    expect(stamp({}, [{ lineRef: 'ORD-77-2026-05-04-02' }], counters)).toEqual({
      lineRef: 'ORD-77-2026-05-04-06',
    })
  })

  // What a remount costs, stated as a test so it is a decision rather than a
  // surprise: a forgotten counter still continues from the rows present, and
  // only the no-reuse guarantee is lost. See SequenceCounters' doc comment.
  it('continues from the rows present when the counter has been forgotten', () => {
    const rows: unknown[] = []
    for (let i = 0; i < 3; i++) rows.push(stamp({}, rows)) // a fresh counter each time
    expect(rows[2]).toEqual({ lineRef: 'ORD-77-2026-05-04-03' })
  })

  describe('reading numbers back out of the rows present', () => {
    it('ignores values the template did not produce', () => {
      expect(stamp({}, [{ lineRef: 'LEGACY-9' }])).toEqual({ lineRef: 'ORD-77-2026-05-04-01' })
      expect(stamp({}, [{ lineRef: 5 }, null, 'x'])).toEqual({ lineRef: 'ORD-77-2026-05-04-01' })
    })

    it('does not read a number out of a neighbouring field', () => {
      expect(stamp({}, [{ note: 'ORD-77-2026-05-04-09' }])).toEqual({
        lineRef: 'ORD-77-2026-05-04-01',
      })
    })

    // The fields around the number are wildcarded, so rows numbered before an
    // order's date was corrected still count towards the next number.
    it('still matches rows numbered when the inputs said something else', () => {
      expect(stamp({}, [{ lineRef: 'ORD-14-2020-01-01-11' }])).toEqual({
        lineRef: 'ORD-77-2026-05-04-12',
      })
    })
  })

  describe('resolving a template', () => {
    // The row does not exist yet, so a template can only reach what sits
    // alongside the array — resolved from the array's parent, not the root.
    it('resolves against the object containing the array', () => {
      const nested = { a: { b: { orderNo: 'DEEP', orderDate: '2026-01-01' } } }
      expect(stampSequences(itemsSchema, {}, [], nested, 'a.b', {})).toEqual({
        lineRef: 'DEEP-2026-01-01-01',
      })
      expect(stampSequences(itemsSchema, {}, [], { orderNo: 'TOP', orderDate: '2026-02-02' }, '', {})).toEqual({
        lineRef: 'TOP-2026-02-02-01',
      })
    })

    it('lets inputs alias a deeper path, and give it a default', () => {
      const schema = {
        properties: {
          ref: {
            'x-template': {
              template: '{ordered}/{status}/{seq}',
              inputs: { ordered: 'meta.dates.ordered', status: { path: 'status', default: 'draft' } },
            },
          },
        },
      } as unknown as JsonSchema
      const data = { order: { meta: { dates: { ordered: '2026-05-04' } } } }
      expect(stampSequences(schema, {}, [], data, 'order', {})).toEqual({ ref: '2026-05-04/draft/01' })
    })

    // A value the user has not typed yet leaves a gap, never the placeholder
    // itself — this string is persisted, so "{orderDate}" would be stored.
    it('renders a missing value as empty rather than as the placeholder', () => {
      expect(stampSequences(itemsSchema, {}, [], { order: { orderNo: 'ORD-77' } }, 'order', {})).toEqual({
        lineRef: 'ORD-77--01',
      })
    })

    // The engine's function registry, reached through a stamped row.
    it('passes a {name(arg)} call through to the shared engine', () => {
      const schema = {
        properties: { ref: { 'x-template': { template: '{today(YYYY)}-{seq}' } } },
      } as unknown as JsonSchema
      expect(stampSequences(schema, {}, [], {}, '', {})).toMatchObject({
        ref: expect.stringMatching(/^\d{4}-01$/) as unknown as string,
      })
    })

    it('does not let a form field shadow {seq}', () => {
      const data = { order: { orderNo: 'ORD-77', orderDate: '2026-05-04', seq: '99' } }
      expect(stampSequences(itemsSchema, {}, [], data, 'order', {})).toEqual({
        lineRef: 'ORD-77-2026-05-04-01',
      })
    })
  })

  describe('rows and schemas it leaves alone', () => {
    it('keeps a value the new row already carries', () => {
      const counters: SequenceCounters = {}
      expect(stamp({ lineRef: 'LEGACY-9' }, [], counters)).toEqual({ lineRef: 'LEGACY-9' })
      expect(counters).toEqual({})
    })

    it('leaves the other fields of a row untouched', () => {
      expect(stamp({ note: 'a note' }, [])).toEqual({
        note: 'a note',
        lineRef: 'ORD-77-2026-05-04-01',
      })
    })

    it('ignores a schema with no template, and a malformed one', () => {
      const plain = { type: 'object', properties: { a: { type: 'string' } } } as unknown as JsonSchema
      expect(stampSequences(plain, {}, [], rootData, 'order', {})).toEqual({})

      const bad = { properties: { a: { 'x-template': null }, b: { 'x-template': { padding: 2 } } } }
      expect(stampSequences(bad as unknown as JsonSchema, {}, [], rootData, 'order', {})).toEqual({})
      expect(stampSequences(undefined, {}, [], rootData, 'order', {})).toEqual({})
    })

    // Without {seq} there is nothing to remember, so nothing is stamped —
    // following the inputs afterwards is a control's job, not this module's.
    it('ignores an unnumbered template', () => {
      const plain = { properties: { a: { 'x-template': { template: '{orderNo}' } } } }
      expect(stampSequences(plain as unknown as JsonSchema, {}, [], rootData, 'order', {})).toEqual({})
    })

    it('returns a row it cannot stamp as it found it', () => {
      expect(stamp('not a row', [])).toBe('not a row')
    })
  })
})
