import { describe, expect, it } from 'vitest'
import { buildDerivations, processMatrix, sameDerivations } from './process'
import type { CellValue } from './types'

const matrix: CellValue[][] = [
  ['Item', 'Qty'],
  ['Widget', 10],
  ['Gadget', 20],
]

describe('processMatrix', () => {
  it('includes the raw sheet by default (persistSheet omitted)', async () => {
    const result = await processMatrix(matrix, [{ id: 'total', label: 'Total', expression: '=SUM(B2:B3)' }])
    expect(result).toEqual({ sheet: matrix, derivations: { total: { label: 'Total', value: 30 } } })
  })

  it('includes the raw sheet when persistSheet is explicitly true', async () => {
    const result = await processMatrix(matrix, [{ id: 'total', label: 'Total', expression: '=SUM(B2:B3)' }], {
      persistSheet: true,
    })
    expect(result).toEqual({ sheet: matrix, derivations: { total: { label: 'Total', value: 30 } } })
  })

  it('omits the raw sheet when persistSheet is false', async () => {
    const result = await processMatrix(matrix, [{ id: 'total', label: 'Total', expression: '=SUM(B2:B3)' }], {
      persistSheet: false,
    })
    expect(result).toEqual({ derivations: { total: { label: 'Total', value: 30 } } })
    expect(result).not.toHaveProperty('sheet')
  })

  it('yields an empty derivations map for an empty formulas config', async () => {
    const result = await processMatrix(matrix, [])
    expect(result).toEqual({ sheet: matrix, derivations: {} })
  })

  it('keys each derivation by its id, surfacing an error entry unchanged alongside a good one', async () => {
    const result = await processMatrix(matrix, [
      { id: 'good', label: 'Good', expression: '=SUM(B2:B3)' },
      { id: 'bad', label: 'Bad', expression: '=FOO(B2)' },
    ])
    expect(result.derivations).toEqual({
      good: { label: 'Good', value: 30 },
      bad: { label: 'Bad', value: null, error: '#NAME?' },
    })
  })

  it('a duplicate id collides last-write-wins in the map', async () => {
    const result = await processMatrix(matrix, [
      { id: 'dup', label: 'First', expression: '=SUM(B2:B3)' },
      { id: 'dup', label: 'Second', expression: '=SUM(B2:B2)' },
    ])
    expect(result.derivations).toEqual({ dup: { label: 'Second', value: 10 } })
  })

  it('an id of "__proto__" is stored as a real enumerable entry, not a prototype override', async () => {
    const result = await processMatrix(matrix, [{ id: '__proto__', label: 'Reserved', expression: '=SUM(B2:B3)' }])
    expect(Object.prototype.hasOwnProperty.call(result.derivations, '__proto__')).toBe(true)
    expect(Object.keys(result.derivations)).toEqual(['__proto__'])
    // A bare `__proto__:` key in object-literal syntax is itself special-cased
    // by JS (sets the prototype instead of a data property) — a computed key
    // sidesteps that so this assertion actually tests what it says.
    expect(JSON.parse(JSON.stringify(result.derivations))).toEqual({ ['__proto__']: { label: 'Reserved', value: 30 } })
  })
})

describe('buildDerivations', () => {
  it('keys results by id and omits `error` on success', () => {
    expect(
      buildDerivations([
        { id: 'total', label: 'Total', value: 30 },
        { id: 'broken', label: 'Broken', value: null, error: '#REF!' },
      ]),
    ).toEqual({
      total: { label: 'Total', value: 30 },
      broken: { label: 'Broken', value: null, error: '#REF!' },
    })
  })

  it('resolves a duplicate id last-write-wins', () => {
    const result = buildDerivations([
      { id: 'dup', label: 'First', value: 1 },
      { id: 'dup', label: 'Second', value: 2 },
    ])
    expect(result).toEqual({ dup: { label: 'Second', value: 2 } })
  })

  it('keeps a "__proto__" id as an enumerable own property', () => {
    const result = buildDerivations([{ id: '__proto__', label: 'Reserved', value: 30 }])
    // A bare __proto__ key in object-literal syntax is special-cased by JS, so
    // compare through a JSON round trip to prove this is a real own property.
    expect(JSON.parse(JSON.stringify(result))).toEqual({ ['__proto__']: { label: 'Reserved', value: 30 } })
  })
})

describe('sameDerivations', () => {
  const base = { total: { label: 'Total', value: 30 } }

  it('treats two empty or absent maps as equal', () => {
    expect(sameDerivations(undefined, {})).toBe(true)
    expect(sameDerivations({}, {})).toBe(true)
  })

  it('ignores key order', () => {
    const a = { one: { label: 'One', value: 1 }, two: { label: 'Two', value: 2 } }
    const b = { two: { label: 'Two', value: 2 }, one: { label: 'One', value: 1 } }
    expect(sameDerivations(a, b)).toBe(true)
  })

  it('compares a Date equal to the ISO string it round-trips to', () => {
    // Without this a TODAY() formula would report a change on every mount, since
    // the stored value comes back from JSON as a string while a fresh evaluation
    // produces a Date — dirtying a saved form merely by opening it.
    const date = new Date(Date.UTC(2026, 8, 9))
    expect(sameDerivations({ d: { label: 'D', value: date } }, { d: { label: 'D', value: date.toISOString() } })).toBe(
      true,
    )
  })

  it('reports a differing value, label, key set, or error as changed', () => {
    expect(sameDerivations(base, { total: { label: 'Total', value: 31 } })).toBe(false)
    expect(sameDerivations(base, { total: { label: 'Sum', value: 30 } })).toBe(false)
    expect(sameDerivations(base, {})).toBe(false)
    expect(sameDerivations(base, { other: { label: 'Total', value: 30 } })).toBe(false)
    expect(sameDerivations(base, { total: { label: 'Total', value: 30, error: '#REF!' } })).toBe(false)
  })
})
