import { describe, expect, it } from 'vitest'
import { processMatrix } from './process'
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
