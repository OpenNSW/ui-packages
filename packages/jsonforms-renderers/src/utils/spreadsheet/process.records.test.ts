import { describe, expect, it } from 'vitest'
import { isRecordsSheet, processMatrix, shapeSheet } from './process'
import type { CellValue } from './types'

describe('shapeSheet', () => {
  it('returns the matrix unchanged when neither flag is set', () => {
    const matrix: CellValue[][] = [
      ['Item', 'Qty'],
      ['Widget', 10],
    ]
    expect(shapeSheet(matrix)).toBe(matrix)
  })

  describe('columnHeader', () => {
    it('turns each data row into one record keyed by row 1', () => {
      const matrix: CellValue[][] = [
        ['Item', 'Qty'],
        ['Widget', 10],
        ['Gadget', 20],
      ]
      expect(shapeSheet(matrix, { columnHeader: true })).toEqual([
        { Item: 'Widget', Qty: 10 },
        { Item: 'Gadget', Qty: 20 },
      ])
    })

    it('yields an empty array for a header-only sheet (no data rows)', () => {
      expect(shapeSheet([['Item', 'Qty']], { columnHeader: true })).toEqual([])
    })

    it('yields an empty array for an empty matrix', () => {
      expect(shapeSheet([], { columnHeader: true })).toEqual([])
    })

    it('drops a null/blank header cell instead of stringifying it to a key', () => {
      const matrix: CellValue[][] = [
        ['A', '', 'C'],
        ['1', '2', '3'],
      ]
      expect(shapeSheet(matrix, { columnHeader: true })).toEqual([{ A: '1', C: '3' }])
    })

    it('fills a ragged row shorter than the header with null for its missing keys', () => {
      const matrix: CellValue[][] = [
        ['A', 'B', 'C'],
        ['x', 'y'],
      ]
      expect(shapeSheet(matrix, { columnHeader: true })).toEqual([{ A: 'x', B: 'y', C: null }])
    })

    it('drops a data row longer than the header instead of keeping its unheaded cells', () => {
      const matrix: CellValue[][] = [
        ['A', 'B'],
        ['x', 'y', 'z'],
      ]
      expect(shapeSheet(matrix, { columnHeader: true })).toEqual([{ A: 'x', B: 'y' }])
    })

    it('a duplicate header value collides last-write-wins', () => {
      const matrix: CellValue[][] = [
        ['A', 'A'],
        ['1', '2'],
      ]
      expect(shapeSheet(matrix, { columnHeader: true })).toEqual([{ A: '2' }])
    })

    it('stringifies a non-string header cell with plain String(), not locale-aware formatting', () => {
      const matrix: CellValue[][] = [
        [100, true],
        ['x', 'y'],
      ]
      expect(shapeSheet(matrix, { columnHeader: true })).toEqual([{ '100': 'x', true: 'y' }])
    })
  })

  describe('rowHeader (columnHeader not set)', () => {
    it('turns each OTHER column into one record keyed by column A, transposed', () => {
      const matrix: CellValue[][] = [
        ['Metric', 'Q1', 'Q2'],
        ['Revenue', 100, 120],
        ['Cost', 40, 55],
      ]
      expect(shapeSheet(matrix, { rowHeader: true })).toEqual([
        { Metric: 'Q1', Revenue: 100, Cost: 40 },
        { Metric: 'Q2', Revenue: 120, Cost: 55 },
      ])
    })

    it('yields an empty array when there is only a column A and no other columns', () => {
      expect(shapeSheet([['Metric'], ['Revenue'], ['Cost']], { rowHeader: true })).toEqual([])
    })

    it('yields an empty array for an empty matrix', () => {
      expect(shapeSheet([], { rowHeader: true })).toEqual([])
    })

    it('drops a null/blank column-A cell instead of stringifying it to a key', () => {
      const matrix: CellValue[][] = [
        ['Metric', 'Q1'],
        ['Revenue', 100],
        ['', 999],
        ['Cost', 40],
      ]
      expect(shapeSheet(matrix, { rowHeader: true })).toEqual([{ Metric: 'Q1', Revenue: 100, Cost: 40 }])
    })

    it('fills a short row with null for the missing column', () => {
      const matrix: CellValue[][] = [
        ['Metric', 'Q1', 'Q2'],
        ['Revenue', 100],
      ]
      expect(shapeSheet(matrix, { rowHeader: true })).toEqual([
        { Metric: 'Q1', Revenue: 100 },
        { Metric: 'Q2', Revenue: null },
      ])
    })

    it('a duplicate column-A value collides last-write-wins', () => {
      const matrix: CellValue[][] = [
        ['Metric', 'Q1'],
        ['Revenue', 100],
        ['Revenue', 200],
      ]
      expect(shapeSheet(matrix, { rowHeader: true })).toEqual([{ Metric: 'Q1', Revenue: 200 }])
    })
  })

  it('throws when both columnHeader and rowHeader are true, rather than picking a winner', () => {
    const matrix: CellValue[][] = [
      ['A', 'B'],
      ['1', '2'],
    ]
    expect(() => shapeSheet(matrix, { columnHeader: true, rowHeader: true })).toThrow(
      /columnHeader and rowHeader cannot both be true/,
    )
  })
})

describe('isRecordsSheet', () => {
  it('is false for a matrix', () => {
    expect(
      isRecordsSheet([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toBe(false)
  })

  it('is true for records', () => {
    expect(isRecordsSheet([{ a: 1 }, { a: 2 }])).toBe(true)
  })

  it('is true for an empty sheet (documented, unavoidable tie-break)', () => {
    expect(isRecordsSheet([])).toBe(true)
  })
})

describe('processMatrix records-shaping integration', () => {
  const matrix: CellValue[][] = [
    ['Item', 'Qty'],
    ['Widget', 10],
    ['Gadget', 20],
  ]

  it('shapes sheet as records while derivations still reflect the raw, unshaped matrix', async () => {
    const result = await processMatrix(matrix, [{ id: 'total', label: 'Total', expression: '=SUM(B2:B3)' }], {
      columnHeader: true,
    })
    expect(result.sheet).toEqual([
      { Item: 'Widget', Qty: 10 },
      { Item: 'Gadget', Qty: 20 },
    ])
    expect(result.derivations).toEqual({ total: { label: 'Total', value: 30 } })
  })

  it('omits sheet entirely when persistSheet is false, even with a header flag set', async () => {
    const result = await processMatrix(matrix, [{ id: 'total', label: 'Total', expression: '=SUM(B2:B3)' }], {
      persistSheet: false,
      columnHeader: true,
    })
    expect(result).not.toHaveProperty('sheet')
  })

  it('stays matrix-shaped when neither header flag is set (backward-compat regression guard)', async () => {
    const result = await processMatrix(matrix, [{ id: 'total', label: 'Total', expression: '=SUM(B2:B3)' }])
    expect(Array.isArray(result.sheet)).toBe(true)
    expect(Array.isArray((result.sheet as CellValue[][])[0])).toBe(true)
  })
})
