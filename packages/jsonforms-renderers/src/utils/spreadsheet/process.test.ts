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
    const result = await processMatrix(matrix, [{ label: 'Total', expression: '=SUM(B2:B3)' }])
    expect(result).toEqual({ sheet: matrix, derivations: [{ label: 'Total', value: 30 }] })
  })

  it('includes the raw sheet when persistSheet is explicitly true', async () => {
    const result = await processMatrix(matrix, [{ label: 'Total', expression: '=SUM(B2:B3)' }], {
      persistSheet: true,
    })
    expect(result).toEqual({ sheet: matrix, derivations: [{ label: 'Total', value: 30 }] })
  })

  it('omits the raw sheet when persistSheet is false', async () => {
    const result = await processMatrix(matrix, [{ label: 'Total', expression: '=SUM(B2:B3)' }], {
      persistSheet: false,
    })
    expect(result).toEqual({ derivations: [{ label: 'Total', value: 30 }] })
    expect(result).not.toHaveProperty('sheet')
  })

  it('yields an empty derivations array for an empty formulas config', async () => {
    const result = await processMatrix(matrix, [])
    expect(result).toEqual({ sheet: matrix, derivations: [] })
  })

  it('surfaces an evaluateExpressions error entry unchanged, alongside a good one', async () => {
    const result = await processMatrix(matrix, [
      { label: 'Good', expression: '=SUM(B2:B3)' },
      { label: 'Bad', expression: '=FOO(B2)' },
    ])
    expect(result.derivations).toEqual([
      { label: 'Good', value: 30 },
      { label: 'Bad', value: null, error: '#NAME?' },
    ])
  })
})
