import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JsonSchema } from '@jsonforms/core'
import { stampRowTemplates } from './sequence'
import type { SequenceCounters } from './sequence'

const spec = { template: '{orderNo}-{orderDate}-{seq(2)}' }

const itemsSchema = {
  type: 'object',
  properties: {
    lineRef: { type: 'string', readOnly: true, 'x-template': spec },
    note: { type: 'string' },
  },
} as unknown as JsonSchema

// The array sits at `order.lineItems`, so its rows are filled against
// `order` — the object the template's placeholders live in.
const rootData = { order: { orderNo: 'ORD-77', orderDate: '2026-05-04' } }

const stamp = (newRow: unknown, rows: unknown[], counters: SequenceCounters = {}) =>
  stampRowTemplates(itemsSchema, newRow, rows, rootData, 'order', counters)

/** Stamps one new row against `data` with a single-field schema carrying `template`. */
const stampOne = (template: string, data: unknown = rootData, extra: Record<string, unknown> = {}) =>
  stampRowTemplates(
    { properties: { ref: { 'x-template': { template, ...extra } } } } as unknown as JsonSchema,
    {},
    [],
    data,
    'order',
    {},
  )

/** Adds `count` rows to `rows`, sharing one counter, and returns them. */
const addRows = (count: number, counters: SequenceCounters = {}, rows: unknown[] = []) => {
  for (let i = 0; i < count; i++) rows.push(stamp({}, rows, counters))
  return rows
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('stampRowTemplates', () => {
  it('numbers each new row in turn', () => {
    expect(addRows(3)).toEqual([
      { lineRef: 'ORD-77-2026-05-04-01' },
      { lineRef: 'ORD-77-2026-05-04-02' },
      { lineRef: 'ORD-77-2026-05-04-03' },
    ])
  })

  it('pads to the width {seq(…)} is given, without truncating a wider number', () => {
    expect(stampOne('{orderNo}-{seq(3)}')).toEqual({ ref: 'ORD-77-001' })
    expect(stampOne('{orderNo}-{seq()}')).toEqual({ ref: 'ORD-77-01' })
    expect(stampOne('{orderNo}-{seq(x)}')).toEqual({ ref: 'ORD-77-01' })

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

    // With nothing between them, a neighbour's digits run into the number:
    // `{today(YYYYMMDD)}{seq()}` would read 2026050401 back as the number.
    it('does not number a template whose {seq(…)} touches another placeholder', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      expect(stampOne('{orderNo}{seq(2)}')).toEqual({})
      expect(stampOne('{seq(2)}{orderNo}')).toEqual({})
      expect(warn).toHaveBeenCalledTimes(2)
    })
  })

  describe('resolving a template', () => {
    // The row does not exist yet, so a template can only reach what sits
    // alongside the array — resolved from the array's parent, not the root.
    it('resolves against the object containing the array', () => {
      const nested = { a: { b: { orderNo: 'DEEP', orderDate: '2026-01-01' } } }
      expect(stampRowTemplates(itemsSchema, {}, [], nested, 'a.b', {})).toEqual({
        lineRef: 'DEEP-2026-01-01-01',
      })
      expect(stampRowTemplates(itemsSchema, {}, [], { orderNo: 'TOP', orderDate: '2026-02-02' }, '', {})).toEqual({
        lineRef: 'TOP-2026-02-02-01',
      })
    })

    it('lets inputs alias a deeper path, and give it a default', () => {
      const data = { order: { meta: { dates: { ordered: '2026-05-04' } } } }
      expect(
        stampOne('{ordered}/{status}/{seq(2)}', data, {
          inputs: { ordered: 'meta.dates.ordered', status: { path: 'status', default: 'draft' } },
        }),
      ).toEqual({ ref: '2026-05-04/draft/01' })
    })

    // Same rule as x-computed: a default stands in for null/undefined only.
    it('keeps an empty string rather than replacing it with the default', () => {
      const data = { order: { status: '' } }
      expect(stampOne('{status}/{seq(2)}', data, { inputs: { status: { path: 'status', default: 'draft' } } })).toEqual(
        { ref: '/01' },
      )
    })

    // A value the user has not typed yet leaves a gap, never the placeholder
    // itself — this string is persisted, so "{orderDate}" would be stored.
    it('renders a missing value as empty rather than as the placeholder', () => {
      expect(stampRowTemplates(itemsSchema, {}, [], { order: { orderNo: 'ORD-77' } }, 'order', {})).toEqual({
        lineRef: 'ORD-77--01',
      })
    })

    it('renders a value it cannot print as empty', () => {
      const data = { order: { orderNo: { value: 'ORD-77', label: 'Order 77' } } }
      expect(stampOne('{orderNo}-{seq(2)}', data)).toEqual({ ref: '-01' })
    })

    // The engine's function registry, reached through a stamped row.
    it('passes a {name(arg)} call through to the shared engine', () => {
      const { ref } = stampOne('{today(YYYY)}-{seq(2)}', {}) as { ref: string }
      expect(ref).toMatch(/^\d{4}-01$/)
    })

    it('leaves an unknown call as written, so the typo shows', () => {
      expect(stampOne('{nope()}-{seq(2)}')).toEqual({ ref: '{nope()}-01' })
    })

    it('reads a bare {seq} from the form, like any other value', () => {
      const data = { order: { seq: 'A' } }
      expect(stampOne('{seq}-{seq(2)}', data)).toEqual({ ref: 'A-01' })
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
      expect(stampRowTemplates(plain, {}, [], rootData, 'order', {})).toEqual({})

      const bad = { properties: { a: { 'x-template': null }, b: { 'x-template': { inputs: {} } } } }
      expect(stampRowTemplates(bad as unknown as JsonSchema, {}, [], rootData, 'order', {})).toEqual({})
      expect(stampRowTemplates(undefined, {}, [], rootData, 'order', {})).toEqual({})
    })

    it('returns a row it cannot stamp as it found it', () => {
      expect(stamp('not a row', [])).toBe('not a row')
    })
  })

  // Without {seq(…)} there is nothing to count, but the field is still filled
  // once, when the row is added.
  it('fills an unnumbered template once, without touching the counters', () => {
    const counters: SequenceCounters = {}
    const schema = { properties: { ref: { 'x-template': { template: '{orderNo}/{orderDate}' } } } }
    expect(stampRowTemplates(schema as unknown as JsonSchema, {}, [], rootData, 'order', counters)).toEqual({
      ref: 'ORD-77/2026-05-04',
    })
    expect(counters).toEqual({})
  })
})
